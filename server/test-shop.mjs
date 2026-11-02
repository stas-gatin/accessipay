// Our own test shop: problems we planted on purpose, the customer who met each one, the AI fix,
// and the same customer again after the fix, paid through the PayPal sandbox. Every case is a pair
// of recorded runs (the run ids are the ones the brand site quotes in console/src/site/facts.js).

import fs from 'node:fs';
import path from 'node:path';
import { runMetrics } from './metrics.mjs';

export const CASES = [
  {
    key: 'pay-button', persona: 'agent', before: '20261030-c2dca6', after: '20261030-2514af',
    title: 'The Pay button is a <div>',
    problem: 'The button looks right, but the page never says it is a button. The AI shopping agent finds nothing to press and gives up on the payment page.',
  },
  {
    key: 'focus-trap', persona: 'keyboard', before: '20261030-cea700', after: '20261030-0e4e77',
    title: 'A popup traps the keyboard',
    problem: 'A newsletter popup opens over the cart. Tab only moves inside it, Escape does nothing and the close × cannot be reached, so the keyboard user never gets to checkout.',
  },
  {
    key: 'skip-link', persona: 'keyboard', before: '20261030-ca91a3', after: '20261030-55d6a8',
    title: '24 menu links and no skip link',
    problem: 'Nothing is broken: every page starts with 24 category links, and a keyboard user tabs through all of them on every page. The customer pays, just slower.',
    // The run paid either way, so its last screen says little; show the menu it had to tab through.
    beforeShot: 'first',
    beforeCaption: 'The menu it had to tab through',
  },
  {
    key: 'card-fields', persona: 'screenreader', before: null, after: '20261030-d7eaff',
    title: 'PayPal card fields with a screen reader',
    problem: 'No planted problem here. The check is that a screen reader user can fill the PayPal card fields, which live in iframes, and pay.',
  },
];

const shotOf = (run, which) => {
  const ev = (run.events || []).filter((e) => e.image && (e.type === 'end' || e.type === 'observe'));
  const e = which === 'first' ? ev[0] : ev.at(-1);
  return e ? `/runs-data/${run.id}/${e.image}` : null;
};

export function createTestShop({ runs, dataDir }) {
  // The AI fix that was applied after the blocked run.
  // Fixes made on this computer (data/fixes) and the recorded ones published with the repository.
  function fixFor(runId) {
    if (!runId) return null;
    for (const dir of [path.join(dataDir, 'fixes'), path.join(dataDir, 'recorded', 'fixes')]) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
        try {
          const x = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          if (x.runId !== runId || x.status !== 'applied') continue;
          return { id: x.id, summary: x.summary, changes: (x.accepted || []).map((p) => ({ find: p.find, replace: p.replace, why: p.why })) };
        } catch {}
      }
    }
    return null;
  }

  function side(id, which, caption) {
    const run = id && runs.get(id);
    if (!run) return null;
    const m = run.status === 'finished' ? runMetrics(run) : null;
    const final = [...(run.events || [])].reverse().find((e) => e.type === 'decide' && (e.action === 'give_up' || e.action === 'done'));
    return {
      id: run.id,
      outcome: run.outcome?.status || null,
      reason: final?.thought || null,
      shot: shotOf(run, which),
      caption: caption || null,
      metrics: m && { steps: m.steps, keys: m.keys, klmSeconds: m.klmSeconds, furthestStage: m.furthestStage },
      // The PayPal order status and amount; the order id stays in the run record and the owner report.
      payment: run.payment ? { mode: run.payment.mode, status: run.payment.status, amount: run.payment.amount } : null,
      changes: Array.isArray(run.patches) ? run.patches.length : 0,
      findings: (run.findings || []).map((f) => ({ step: f.step, page: f.page, problem: f.problem })),
    };
  }

  function build(c) {
    const before = side(c.before, c.beforeShot, c.beforeCaption);
    const after = side(c.after);
    return { key: c.key, persona: c.persona, title: c.title, problem: c.problem, before, after, fix: fixFor(c.before) };
  }

  return {
    list: () => CASES.map(build).filter((c) => c.after),
    get: (key) => { const c = CASES.find((x) => x.key === key); return c ? build(c) : null; },
  };
}
