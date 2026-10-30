// Evaluation: AccessiPay vs axe-core on every defect, one defect per shop.
//
//   node eval/run-eval.mjs [--split holdout|train|all] [--personas screenreader,keyboard,agent] [--model claude-haiku-5-5] [--dry]
//
// Talks to a running server (ACCESSIPAY_URL, default http://127.0.0.1:4300) that has the Claude API brain.
// For each persona it first runs the clean shop as a control. A defect counts as found by AccessiPay when
//   (a) the shopper is blocked on the defect's page while the same persona bought the clean shop, or
//   (b) the shopper reports a problem on the defect's page that matches the defect.
// axe-core counts as finding a defect when the scan of that shop has more violations than the clean shop.
// --dry prints the plan and an upper cost estimate without starting any run.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.ACCESSIPAY_URL || 'http://127.0.0.1:4300';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] == null ? true : all[i + 1]] : null)).filter(Boolean));
const split = args.split || 'all';
const personas = String(args.personas || 'screenreader,keyboard,agent').split(',');
const model = args.model || undefined;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_TITLES = { catalog: 'Shop', cart: 'Your cart', checkout: 'Checkout', pay: 'Payment', done: 'Order confirmed' };

async function api(p, body) {
  const r = await fetch(BASE + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}

async function runAndWait(body) {
  const { id } = await api('/api/runs', body);
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = await api(`/api/runs/${id}`);
    if (r.status === 'finished') return r;
  }
}

// Wilson score interval for k successes out of n, 95%.
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

const endPage = (run) => {
  const end = run.events.find((e) => e.type === 'end');
  return Object.entries({ '/': 'catalog', '/cart': 'cart', '/checkout': 'checkout', '/pay': 'pay', '/done': 'done' }).find(([p]) => p === end?.path)?.[1];
};

function reported(run, defect) {
  const title = PAGE_TITLES[defect.page].toLowerCase();
  return (run.findings || []).some((f) => String(f.page || '').toLowerCase().includes(title)
    && defect.match.some((w) => String(f.problem || '').toLowerCase().includes(w)));
}

const meta = await api('/api/meta');
if (!args.dry && !meta.claude) { console.error('The server has no Claude API key (ANTHROPIC_API_KEY). Nothing was started.'); process.exit(1); }
const defects = meta.defects.filter((d) => split === 'all' || d.split === split);
console.log(`Plan: ${personas.length} controls + ${defects.length} defects x ${personas.length} personas = ${personas.length * (defects.length + 1)} runs on ${BASE}, model ${model || '(server default)'}`);
if (args.dry) {
  // Upper bound: every run uses its full step budget at about 6k input and 400 output tokens per step.
  const steps = personas.reduce((s, p) => s + (meta.personas[p].maxSteps || 40), 0) * (defects.length + 1);
  console.log(`Upper bound: ${steps} model requests, about ${(steps * 6).toLocaleString()}k input tokens.`);
  process.exit(0);
}

const clean = await api('/api/scan', { defects: [] });
const control = {};
for (const p of personas) {
  control[p] = await runAndWait({ persona: p, brain: 'anthropic', model, defects: [], label: 'eval control' });
  console.log(`control ${p}: ${control[p].outcome.status} in ${control[p].steps} steps`);
}

const results = {};
const runIds = [];
for (const d of defects) {
  const scan = await api('/api/scan', { defects: [d.id] });
  const axeFound = scan.totalViolations > clean.totalViolations;
  const per = {};
  for (const p of personas) {
    const r = await runAndWait({ persona: p, brain: 'anthropic', model, defects: [d.id], label: `eval ${d.id}` });
    runIds.push(r.id);
    const blocked = r.outcome.status !== 'purchased' && control[p].outcome.status === 'purchased' && endPage(r) === d.page;
    per[p] = { run: r.id, outcome: r.outcome.status, blocked, reported: reported(r, d), steps: r.steps, cost: r.usage?.costUsd || 0 };
    console.log(`${d.id} / ${p}: ${r.outcome.status}${blocked ? ' (blocked on its page)' : ''}${per[p].reported ? ' (reported)' : ''}`);
  }
  results[d.id] = {
    split: d.split, axeFound, axeViolations: scan.totalViolations - clean.totalViolations,
    agentFound: Object.values(per).some((x) => x.blocked || x.reported),
    blockedPersonas: Object.entries(per).filter(([, x]) => x.blocked).map(([p]) => p),
    personas: per,
  };
}

const ids = Object.keys(results);
const count = (f, set = ids) => set.filter((id) => f(results[id])).length;
const holdout = ids.filter((id) => results[id].split === 'holdout');
const agentFound = count((r) => r.agentFound);
const [lo, hi] = wilson(agentFound, ids.length);
const cost = Object.values(results).reduce((s, r) => s + Object.values(r.personas).reduce((t, x) => t + x.cost, 0), 0)
  + Object.values(control).reduce((s, r) => s + (r.usage?.costUsd || 0), 0);

const out = {
  createdAt: new Date().toISOString(),
  model: model || 'server default',
  personas,
  control: Object.fromEntries(Object.entries(control).map(([p, r]) => [p, { run: r.id, outcome: r.outcome.status, steps: r.steps }])),
  summary: {
    total: ids.length,
    axeFound: count((r) => r.axeFound),
    agentFound,
    ci: `95% Wilson interval for AccessiPay: ${Math.round(lo * 100)}% to ${Math.round(hi * 100)}% (n=${ids.length}, one run per defect and persona)`,
    holdoutTotal: holdout.length,
    holdoutAgent: count((r) => r.agentFound, holdout),
    holdoutAxe: count((r) => r.axeFound, holdout),
    costUsd: Math.round(cost * 1000) / 1000,
  },
  method: 'One defect per shop. axe-core: default rules on every page of the flow with a filled cart. AccessiPay: found if a persona is blocked on the defect page while it bought the clean shop, or reports a matching problem on that page. Single run per cell; small n, so read the interval, not the point estimate.',
  defects: results,
  runIds,
};
fs.mkdirSync(path.join(root, 'data', 'eval'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'eval', 'results.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.summary, null, 2));
