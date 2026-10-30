// Keeps runs: starts them, streams their events, verifies the order with PayPal, saves them to disk.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runShopper } from './run.mjs';
import { PERSONAS, FINAL_ACTION } from './session.mjs';
import { DEFAULT_GOAL, GOALS, EXTERNAL_GOAL } from './prompts.mjs';
import { scriptedBrain } from './brains/scripted.mjs';
import { externalBrain } from './brains/external.mjs';
import { scanShop } from '../scan/axe.mjs';
import { checkRobots } from './preflight.mjs';

// Real sites: the run ends successfully when a payment form is on screen.
export async function reachedPayment(page) {
  if (!page) return false;
  try {
    const h = await page.evaluate((finalSource) => {
      const FINAL = new RegExp(finalSource, 'i');
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 40 && r.height > 20 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0;
      };
      // Only a card field or a payment iframe the customer can actually see counts; words alone do not.
      const cc = [...document.querySelectorAll('input[autocomplete^="cc-"], input[name*="cardnumber" i], input[name*="card_number" i], input[id*="card-number" i]')].some(visible);
      const frames = [...document.querySelectorAll('iframe')].filter(visible)
        .some((f) => /card|payment|stripe|adyen|braintree|shopifycs|paypal|checkout\.com/i.test(`${f.src || ''} ${f.title || ''} ${f.name || ''}`));
      // Or the last step: an enabled button that would pay or place the order is on screen.
      const finalButton = [...document.querySelectorAll('button, [role="button"], input[type="submit"]')]
        .filter((el) => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true')
        .some((el) => FINAL.test(`${el.getAttribute('aria-label') || ''} ${el.innerText || el.value || ''}`.trim()));
      return { cc, frames, finalButton, url: location.href };
    }, FINAL_ACTION.source);
    const atCheckout = /checkout|payment|pay\b/i.test(h.url);
    return h.cc || (h.frames && atCheckout) || (h.finalButton && atCheckout);
  } catch { return false; }
}

function checkExternalUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('That is not a valid URL'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https sites can be tested');
  if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|\[?::1)/.test(u.hostname)) throw new Error('Local and private addresses cannot be tested');
  return u;
}

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
    const site = opts.url ? checkExternalUrl(opts.url) : null;
    const inst = site ? null : opts.instanceId ? shop.get(opts.instanceId) : shop.create({ defects: opts.defects || [] });
    if (!site && !inst) throw new Error('Shop instance not found');
    if (inst && opts.instanceId && opts.resetCart !== false) { inst.cart = []; inst.coupon = ''; inst.shipping = null; inst.order = null; shop.save(inst); }

    const id = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex');
    const goalId = GOALS[opts.goalId] ? opts.goalId : 'checkout';
    const brain = makeBrain(opts.brain || 'external', opts);
    const abort = new AbortController();
    const rec = {
      id, createdAt: new Date().toISOString(), label: opts.label || '',
      persona, brainKind: brain.kind, model: brain.model || null,
      instanceId: inst?.id || null, defects: inst ? [...inst.defects] : [], patches: inst ? inst.patches.map((p) => p.id || p.find.slice(0, 40)) : [],
      site: site ? { url: site.href, host: site.hostname } : null,
      paypalMode: paypal.mode, goalId, goal: opts.goal || (site ? EXTERNAL_GOAL : GOALS[goalId].text || DEFAULT_GOAL), maxSteps: opts.maxSteps || PERSONAS[persona].maxSteps || 40,
      status: 'running', outcome: null, findings: [], events: [], brain, abort,
    };
    runs.set(id, rec);

    const startUrl = site ? site.href : `${origin}/s/${inst.id}${opts.startPath || '/'}`;
    // Real sites: robots.txt first. A site that asks not to be visited is not visited.
    (site ? checkRobots(site.href) : Promise.resolve(null)).then((robots) => {
      if (robots) rec.robots = robots;
      if (robots && !robots.ok) {
        publish(rec, { t: new Date().toISOString(), type: 'guard', blocked: robots.reason });
        return { outcome: { status: 'not-testable', reason: `${robots.reason} The site was not visited.` }, findings: [], steps: 0, pageScans: [] };
      }
      return runShopper({
      browser, startUrl, persona, brain, goal: rec.goal, maxSteps: rec.maxSteps,
      // A payment can still be in flight (the sandbox takes a few seconds): wait for it before judging.
      oracle: site ? reachedPayment : async (page, opts = {}) => {
        // When the customer says it is done, give a payment that is still on its way to PayPal a moment.
        const rounds = opts.final ? 20 : 60;
        for (let i = 0; i < rounds; i++) {
          if (inst.order?.status === 'COMPLETED') return true;
          if (!inst.paying && (!opts.final || i >= 6)) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        return inst.order?.status === 'COMPLETED';
      },
      external: !!site,
      onEvent: (e) => publish(rec, e),
      shotsDir: path.join(runsDir, id),
      signal: abort.signal,
    });
    })
      .then(async (r) => {
        rec.outcome = r.outcome;
        rec.findings = r.findings;
        rec.steps = r.steps;
        if (site) rec.scan = { totalViolations: r.pageScans.reduce((s, p) => s + (p.violations || 0), 0), pages: r.pageScans, inRun: true };
        if (inst && inst.order) {
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
          // Did it buy what the customer actually needed?
          const want = GOALS[goalId].expect;
          const lines = inst.order.lines || [];
          rec.goalCheck = { expected: want, bought: lines.map((l) => `${l.qty} x ${l.sku}`), delivery: inst.order.delivery,
            met: lines.length === 1 && lines[0].sku === want.sku && lines[0].qty === 1 && inst.order.delivery === want.delivery };
          if (rec.outcome.status === 'purchased' && !rec.goalCheck.met) {
            rec.outcome = { status: 'wrong-item', reason: `Paid, but not what the customer asked for (${rec.goalCheck.bought.join(', ')}, ${inst.order.delivery} delivery).` };
          }
        }
      })
      .then(async () => {
        if (site) return;
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
    // The recorded copy is the published one (anonymized for real retailers), so it wins.
    for (const dir of [recordedDir, runsDir]) {
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
      return r && { id: r.id, createdAt: r.createdAt, label: r.label, persona: r.persona, brainKind: r.brainKind, model: r.model, defects: r.defects, patches: r.patches, status: r.status, outcome: r.outcome, steps: r.steps, payment: r.payment, site: r.site, goalId: r.goalId, goalCheck: r.goalCheck, usage: r.usage, findings: r.findings, scan: r.scan && { totalViolations: r.scan.totalViolations }, recorded: !!r.recorded, instanceId: r.instanceId };
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
