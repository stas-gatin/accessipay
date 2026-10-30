// Keeps runs: starts them, streams their events, verifies the order with PayPal, saves them to disk.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runShopper } from './run.mjs';
import { PERSONAS } from './session.mjs';
import { DEFAULT_GOAL } from './prompts.mjs';
import { scriptedBrain } from './brains/scripted.mjs';
import { externalBrain } from './brains/external.mjs';
import { scanShop } from '../scan/axe.mjs';

export function createRuns({ browser, shop, paypal, dataDir, origin, brains = {} }) {
  const runs = new Map();
  const listeners = new Map();
  const runsDir = path.join(dataDir, 'runs');
  fs.mkdirSync(runsDir, { recursive: true });

  const publish = (rec, e) => {
    rec.events.push(e);
    (listeners.get(rec.id) || []).forEach((fn) => fn(e));
  };

  const save = (rec) => {
    const { brain, abort, ...plain } = rec;
    fs.writeFileSync(path.join(runsDir, `${rec.id}.json`), JSON.stringify(plain, null, 2));
  };

  function makeBrain(kind, opts) {
    if (kind === 'scripted') return scriptedBrain(opts.script || []);
    if (kind === 'external') return externalBrain();
    if (brains[kind]) return brains[kind](opts);
    throw new Error(`Unknown brain "${kind}"`);
  }

  function start(opts) {
    const persona = opts.persona || 'screenreader';
    if (!PERSONAS[persona]) throw new Error(`Unknown persona "${persona}"`);
    const inst = opts.instanceId ? shop.get(opts.instanceId) : shop.create({ defects: opts.defects || [] });
    if (!inst) throw new Error('Shop instance not found');
    if (opts.instanceId && opts.resetCart !== false) { inst.cart = []; inst.coupon = ''; inst.shipping = null; inst.order = null; shop.save(inst); }

    const id = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex');
    const brain = makeBrain(opts.brain || 'external', opts);
    const abort = new AbortController();
    const rec = {
      id, createdAt: new Date().toISOString(), label: opts.label || '',
      persona, brainKind: brain.kind, model: brain.model || null,
      instanceId: inst.id, defects: [...inst.defects], patches: inst.patches.map((p) => p.id || p.find.slice(0, 40)),
      paypalMode: paypal.mode, goal: opts.goal || DEFAULT_GOAL, maxSteps: opts.maxSteps || PERSONAS[persona].maxSteps || 40,
      status: 'running', outcome: null, findings: [], events: [], brain, abort,
    };
    runs.set(id, rec);

    const startUrl = `${origin}/s/${inst.id}${opts.startPath || '/'}`;
    runShopper({
      browser, startUrl, persona, brain, goal: rec.goal, maxSteps: rec.maxSteps,
      // A payment can still be in flight (the sandbox takes a few seconds): wait for it before judging.
      oracle: async () => {
        for (let i = 0; i < 60 && inst.paying; i++) await new Promise((r) => setTimeout(r, 500));
        return inst.order?.status === 'COMPLETED';
      },
      onEvent: (e) => publish(rec, e),
      shotsDir: path.join(runsDir, id),
      signal: abort.signal,
    })
      .then(async (r) => {
        rec.outcome = r.outcome;
        rec.findings = r.findings;
        rec.steps = r.steps;
        if (inst.order) {
          try {
            const o = await paypal.getOrder(inst.order.paypalOrderId);
            rec.payment = { mode: paypal.mode, orderId: inst.order.paypalOrderId, status: o?.status || 'NOT FOUND', amount: inst.order.total };
          } catch (e) {
            rec.payment = { mode: paypal.mode, orderId: inst.order.paypalOrderId, status: 'CHECK FAILED', error: e.message };
          }
          publish(rec, { t: new Date().toISOString(), type: 'oracle', payment: rec.payment });
          if (rec.outcome.status === 'purchased' && rec.payment.status !== 'COMPLETED') {
            rec.outcome = { status: 'blocked', reason: `PayPal reports the order as ${rec.payment.status}.` };
          }
        }
      })
      .then(async () => {
        // The scanner's view of the very same shop (defects and patches), kept with the run.
        try {
          rec.scan = await scanShop({ browser, shop, origin, defects: inst.defects, patches: inst.patches });
          publish(rec, { t: new Date().toISOString(), type: 'scan', totalViolations: rec.scan.totalViolations });
        } catch (e) { rec.scan = { error: e.message }; }
      })
      .catch((e) => {
        rec.outcome = { status: 'error', reason: e.message };
        publish(rec, { t: new Date().toISOString(), type: 'error', message: e.message });
      })
      .finally(() => {
        rec.status = 'finished';
        if (rec.brain.usage) rec.usage = { ...rec.brain.usage };
        rec.brain.close?.();
        publish(rec, { t: new Date().toISOString(), type: 'finished', outcome: rec.outcome });
        save(rec);
      });
    return rec;
  }

  const recordedDir = path.join(dataDir, 'recorded');
  function get(id) {
    if (runs.has(id)) return runs.get(id);
    for (const dir of [runsDir, recordedDir]) {
      const file = path.join(dir, `${id}.json`);
      if (fs.existsSync(file)) return { ...JSON.parse(fs.readFileSync(file, 'utf8')), recorded: dir === recordedDir };
    }
    return null;
  }

  function list() {
    const json = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : []);
    const fromDisk = [...json(runsDir), ...json(recordedDir)];
    const ids = [...new Set([...runs.keys(), ...fromDisk])].sort().reverse();
    return ids.map((id) => {
      const r = get(id);
      return r && { id: r.id, createdAt: r.createdAt, label: r.label, persona: r.persona, brainKind: r.brainKind, model: r.model, defects: r.defects, patches: r.patches, status: r.status, outcome: r.outcome, steps: r.steps, payment: r.payment, usage: r.usage, findings: r.findings, scan: r.scan && { totalViolations: r.scan.totalViolations }, recorded: !!r.recorded, instanceId: r.instanceId };
    }).filter(Boolean);
  }

  function subscribe(id, fn) {
    if (!listeners.has(id)) listeners.set(id, []);
    listeners.get(id).push(fn);
    return () => listeners.set(id, (listeners.get(id) || []).filter((f) => f !== fn));
  }

  function stop(id) {
    const r = runs.get(id);
    if (!r || r.status !== 'running') return false;
    r.abort.abort();
    r.brain.submit?.({ action: 'give_up', thought: 'Stopped by the operator.', findings: [] });
    return true;
  }

  const plain = (rec) => { const { brain, abort, ...p } = rec; return p; };
  return { start, get, list, subscribe, stop, plain, runs };
}
