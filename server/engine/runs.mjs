// Keeps runs: starts them, streams their events, verifies the order with PayPal, saves them to disk.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runShopper } from './run.mjs';
import { PERSONAS, FINAL_ACTION } from './session.mjs';
import { DEFAULT_GOAL, GOALS, EXTERNAL_GOAL, SANDBOX_GOAL } from './prompts.mjs';
import { scriptedBrain } from './brains/scripted.mjs';
import { externalBrain } from './brains/external.mjs';
import { scanShop } from '../scan/axe.mjs';
import { checkRobots } from './preflight.mjs';
import { createPayPal } from '../paypal/client.mjs';
import { keyGoesTo, PRIVATE_HOST } from '../owners.mjs';

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
      const shown = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
      // Or the payment method choice itself: at least two visible options that name ways to pay.
      const METHOD = /paypal|credit card|debit card|card payment|pay by card|cash on delivery|bank transfer|invoice|klarna|apple pay|google pay|check \/ money order|afterpay/i;
      const labelOf = (el) => `${el.getAttribute('aria-label') || ''} ${el.labels?.[0]?.innerText || ''} ${el.closest('label')?.innerText || ''} ${el.innerText || ''}`;
      const methods = [...document.querySelectorAll('input[type="radio"], [role="radio"]')]
        .filter((el) => METHOD.test(labelOf(el)) && [el, el.labels?.[0], el.closest('label')].some((x) => x && shown(x)));
      // Some checkouts (Global-e among them) offer the methods as a row of buttons: Card, PayPal, Klarna, Google Pay.
      // Only under a visible "Payment" heading, so express-checkout buttons at the top of a checkout do not count.
      const name = (el) => (el.getAttribute('aria-label') || el.innerText || '').trim().toLowerCase();
      const payHeading = [...document.querySelectorAll('h1, h2, h3, h4, [role="heading"]')]
        .some((h) => shown(h) && /^\s*(payment|payment method|pago|método de pago|paiement|zahlung|zahlungsart|pagamento|betaling)\s*$/i.test(h.innerText || ''));
      const methodButtons = payHeading ? [...document.querySelectorAll('button, [role="button"], [role="tab"]')]
        .filter((el) => shown(el) && /^(card|credit card|debit card|tarjeta|paypal|klarna\w*|google pay|apple ?pay|afterpay|affirm|clearpay)$/i.test(name(el))) : [];
      if (new Set(methodButtons.map(name)).size >= 2) methods.push(...methodButtons);
      return { cc, frames, finalButton, methodChoice: methods.length >= 2, url: location.href };
    }, FINAL_ACTION.source);
    const atCheckout = /checkout|payment|pay\b/i.test(h.url);
    return h.cc || (h.frames && atCheckout) || (h.finalButton && atCheckout) || (h.methodChoice && atCheckout);
  } catch { return false; }
}

function checkExternalUrl(raw, allowLocal) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('That is not a valid URL'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https sites can be tested');
  if (!allowLocal && PRIVATE_HOST.test(u.hostname)) throw new Error('Local and private addresses cannot be tested');
  return u;
}

// Reads orders back from an owner's PayPal sandbox. An order counts only when it is COMPLETED and was
// created during this run: the owner's keys see only their own orders, so it is theirs too.
export function sandboxOracle({ keys, startedAt, orderIds, paypalFor = (k) => createPayPal({ PAYPAL_CLIENT_ID: k.clientId, PAYPAL_CLIENT_SECRET: k.secret }) }) {
  const pp = paypalFor(keys);
  const seen = new Map();
  const fresh = (o) => !o.create_time || Date.parse(o.create_time) >= startedAt - 60000;
  const found = () => [...seen.values()].find((o) => o.status === 'COMPLETED' && fresh(o)) || null;
  async function look() {
    for (const id of orderIds) {
      if (seen.get(id)?.status === 'COMPLETED') continue;
      try { seen.set(id, await pp.getOrder(id)); } catch { seen.set(id, { id, status: 'NOT FOUND' }); }
    }
    return found();
  }
  return {
    async check(page, opts = {}) {
      // When the customer says it is done, give a capture that is still on its way a few seconds.
      for (let i = 0; i < (opts.final ? 8 : 1); i++) {
        if (await look()) return true;
        if (opts.final) await new Promise((r) => setTimeout(r, 1000));
      }
      return false;
    },
    // What the run record keeps: the completed order, or the last one PayPal knew about.
    payment() {
      const o = found() || [...seen.values()].filter((x) => x.status !== 'NOT FOUND').at(-1);
      if (!o) return { mode: 'owner-sandbox', orderId: null, status: orderIds.size ? 'NOT FOUND' : 'NO ORDER' };
      const unit = o.purchase_units?.[0];
      const amount = unit?.payments?.captures?.[0]?.amount || unit?.amount;
      return { mode: 'owner-sandbox', orderId: o.id, status: o.status, amount: amount ? Number(amount.value) : null, currency: amount?.currency_code || null, createdAt: o.create_time || null };
    },
  };
}

export function createRuns({ browser, shop, paypal, dataDir, origin, brains = {}, owners = null, privateView = false, allowLocal = false, paypalFor }) {
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
    const site = opts.url ? checkExternalUrl(opts.url, allowLocal) : null;
    // A site its owner verified: their access key opens their bot protection for this run.
    const owner = site && opts.ownerSiteId && owners ? owners.raw(opts.ownerSiteId) : null;
    if (owner && (!owner.verified || !keyGoesTo(owner.host, site.hostname))) throw new Error('This site is not verified for this address yet');
    // Paying in the owner's PayPal sandbox: only on the staging checkout they connected.
    const sandbox = opts.payInSandbox ? owner?.sandbox : null;
    if (opts.payInSandbox && !sandbox) throw new Error('Connect your PayPal sandbox first');
    if (sandbox && new URL(sandbox.url).host !== site.host) throw new Error('Paying in the sandbox works only on the staging checkout you connected');
    const inst = site ? null : opts.instanceId ? shop.get(opts.instanceId) : shop.create({ defects: opts.defects || [] });
    if (!site && !inst) throw new Error('Shop instance not found');
    if (inst && opts.instanceId && opts.resetCart !== false) { inst.cart = []; inst.coupon = ''; inst.shipping = null; inst.order = null; shop.save(inst); }

    const id = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex');
    const goalId = GOALS[opts.goalId] ? opts.goalId : 'checkout';
    const brain = makeBrain(opts.brain || 'external', opts);
    const abort = new AbortController();
    const rec = {
      id, createdAt: new Date().toISOString(), label: opts.label || '', liveDemo: !!opts.liveDemo,
      persona, brainKind: brain.kind, model: brain.model || null,
      instanceId: inst?.id || null, defects: inst ? [...inst.defects] : [], patches: inst ? inst.patches.map((p) => p.id || p.find.slice(0, 40)) : [],
      site: site ? { url: site.href, host: site.hostname, ownerVerified: !!owner, sandbox: !!sandbox } : null,
      paypalMode: sandbox ? 'owner-sandbox' : paypal.mode, goalId, goal: opts.goal || (sandbox ? SANDBOX_GOAL : site ? EXTERNAL_GOAL : GOALS[goalId].text || DEFAULT_GOAL), maxSteps: opts.maxSteps || PERSONAS[persona].maxSteps || 40,
      status: 'running', outcome: null, findings: [], events: [], brain, abort,
    };
    runs.set(id, rec);

    const startUrl = site ? site.href : `${origin}/s/${inst.id}${opts.startPath || '/'}`;
    const orderIds = new Set();
    const sandboxCheck = sandbox ? sandboxOracle({ keys: sandbox, startedAt: Date.now(), orderIds, paypalFor }) : null;
    // Real sites: robots.txt first. A site that asks not to be visited is not visited.
    // robots.txt speaks to crawlers; on a site its owner verified, the owner's consent covers the run.
    (site && !owner ? checkRobots(site.href) : Promise.resolve(null)).then((robots) => {
      if (robots) rec.robots = robots;
      if (robots && !robots.ok) {
        publish(rec, { t: new Date().toISOString(), type: 'guard', blocked: robots.reason });
        return { outcome: { status: 'not-testable', reason: `${robots.reason} The site was not visited.` }, findings: [], steps: 0, pageScans: [] };
      }
      return runShopper({
      browser, startUrl, persona, brain, goal: rec.goal, maxSteps: rec.maxSteps,
      // A payment can still be in flight (the sandbox takes a few seconds): wait for it before judging.
      oracle: sandboxCheck ? sandboxCheck.check : site ? reachedPayment : async (page, opts = {}) => {
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
      siteAccess: owner ? { host: owner.host, key: owner.key } : null,
      sandboxPay: sandbox ? { clientId: sandbox.clientId, orderIds } : null,
    });
    })
      .then(async (r) => {
        rec.outcome = r.outcome;
        rec.findings = r.findings;
        rec.steps = r.steps;
        if (site) rec.scan = { totalViolations: r.pageScans.reduce((s, p) => s + (p.violations || 0), 0), pages: r.pageScans, inRun: true };
        if (sandboxCheck) {
          rec.payment = sandboxCheck.payment();
          rec.payment.sdkClientIds = r.sdkClientIds;
          publish(rec, { t: new Date().toISOString(), type: 'oracle', payment: rec.payment });
          if (rec.outcome.status === 'purchased' && rec.payment.status !== 'COMPLETED') {
            rec.outcome = { status: 'blocked', reason: `The shop's PayPal sandbox reports the order as ${rec.payment.status}.` };
          }
        }
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
    // The recorded copy is the published one (anonymized for real retailers), so it wins,
    // except in the founder's private view, which shows the originals with names and screenshots.
    for (const dir of privateView ? [runsDir, recordedDir] : [recordedDir, runsDir]) {
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
      return r && { id: r.id, createdAt: r.createdAt, label: r.label, liveDemo: !!r.liveDemo, persona: r.persona, brainKind: r.brainKind, model: r.model, defects: r.defects, patches: r.patches, status: r.status, outcome: r.outcome, steps: r.steps, payment: r.payment, site: r.site, goalId: r.goalId, goalCheck: r.goalCheck, usage: r.usage, findings: r.findings, scan: r.scan && { totalViolations: r.scan.totalViolations }, recorded: !!r.recorded, instanceId: r.instanceId };
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
