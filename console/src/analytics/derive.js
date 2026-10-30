// Pure helpers for the analytics page. Everything here is computed from the /api/analytics payload;
// nothing is a hard-coded result. Model constants (keystroke-level model) mirror server/metrics.mjs.

import { OUTCOME } from '../api.js';

export const STAGE_ORDER = ['Browse', 'Cart', 'Checkout', 'Payment', 'Paid'];
// Card, Moran and Newell (1983). Same values as KLM in server/metrics.mjs.
export const KLM = { keystroke: 0.28, mental: 1.35, wordsPerMinute: 180 };

// Same convention as the server: the upper middle value for an even count.
export function median(xs) {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
}
export const sum = (xs) => xs.reduce((t, x) => t + (x || 0), 0);
export const range = (xs) => {
  const v = xs.filter((x) => x != null);
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
};
export const fmtRange = (r) => (!r ? '—' : r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export function fmtSeconds(s) {
  if (s == null) return '—';
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return r ? `${m} min ${r} s` : `${m} min`;
}

export const personaLabel = (meta, p) => meta?.personas?.[p]?.label || p;
export const defectLabel = (meta, id) => (id ? meta?.defects?.find((d) => d.id === id)?.short || id : null);
export const outcomeLabel = (o) => (o === 'reached-payment' ? 'Reached payment' : OUTCOME[o]?.label || o || '—');
export const outcomeTone = (o) => OUTCOME[o]?.tone || 'muted';
export const shortId = (id) => String(id).split('-').pop();
export const shopLabel = (r) => r.site || 'Demo shop';
export const words = (n) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
// Lower-cases a label for use mid-sentence, keeping acronyms such as "AI".
export const lc = (s) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
export function ticks(max, count = 4) {
  // Prefer a count that gives whole-number steps (50 -> 0, 10, 20 ... rather than 12.5).
  const pick = [count, 5, 4, 3, 2].find((c) => Number.isInteger(max / c)) || count;
  const step = max / pick;
  count = pick;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 100) / 100);
}

// Paid runs in the demo shop: the only runs whose effort is comparable.
export const paidDemo = (rows) => rows.filter((r) => !r.site && r.outcome === 'purchased');

// The paid demo run per customer type whose step count is closest to that type's median.
export function typicalRuns(a) {
  return a.effort
    .filter((e) => e.runs > 0)
    .map((e) => {
      const runs = paidDemo(a.runRows).filter((r) => r.persona === e.persona);
      const pick = [...runs].sort((x, y) => Math.abs(x.steps - e.medianSteps) - Math.abs(y.steps - e.medianSteps))[0];
      return pick ? { persona: e.persona, run: pick, n: runs.length } : null;
    })
    .filter(Boolean);
}

// Stages that hold at least one step in the given runs, in checkout order.
export function stagesUsed(runs) {
  return STAGE_ORDER.filter((s) => runs.some((r) => (r.stepsPerStage?.[s] || 0) > 0));
}

// Same customer type, same shop setup (defect and fix), repeated: shows how stable a result is.
export function conditions(rows, meta) {
  const groups = new Map();
  for (const r of rows.filter((x) => !x.site)) {
    const key = `${r.persona}|${r.defect || 'none'}|${r.fixed}`;
    if (!groups.has(key)) groups.set(key, { key, persona: r.persona, defect: r.defect, fixed: r.fixed, runs: [] });
    groups.get(key).runs.push(r);
  }
  const order = ['agent', 'keyboard', 'screenreader'];
  return [...groups.values()]
    .map((g) => ({
      ...g,
      label: `${personaLabel(meta, g.persona)} · ${g.defect ? defectLabel(meta, g.defect) : 'shop without injected defects'}${g.defect ? (g.fixed ? ', after AI fix' : ', as built') : ''}`,
      agree: new Set(g.runs.map((r) => r.outcome)).size === 1,
      steps: range(g.runs.map((r) => r.steps)),
    }))
    .sort((x, y) => order.indexOf(x.persona) - order.indexOf(y.persona) || String(x.defect).localeCompare(String(y.defect)) || Number(x.fixed) - Number(y.fixed));
}

// Clean-shop baseline for a customer type: paid demo runs without any injected defect.
export function baseline(rows, persona) {
  const runs = paidDemo(rows).filter((r) => r.persona === persona && !r.defect);
  return runs.length ? { runs, steps: median(runs.map((r) => r.steps)), range: range(runs.map((r) => r.steps)) } : null;
}

// Replicates of the before and after conditions of a pair.
export function pairReplicates(rows, pair, defect) {
  const same = (fixed) => rows.filter((r) => !r.site && r.persona === pair.persona && (r.defect || null) === (defect || null) && r.fixed === fixed);
  return { before: same(false), after: same(true) };
}

// Status shape for a run outcome (used with the colour, never instead of the label).
export function outcomeShape(o) {
  if (o === 'purchased') return 'paid';
  if (o === 'reached-payment') return 'reached';
  if (o === 'wrong-item') return 'wrong';
  return 'blocked';
}
