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
// Word joiners around the dash keep a range on one line ("18–19" never breaks after the dash).
export const fmtRange = (r) => (!r ? '—' : r[0] === r[1] ? `${r[0]}` : `${r[0]}\u2060–\u2060${r[1]}`);
export const fmtInt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// One format everywhere, so 120 s and 116 s read alike: "2:00 min" and "1:56 min".
export function fmtSeconds(s) {
  if (s == null) return '—';
  const v = Math.round(s);
  if (v < 60) return `${v}\u00a0s`;
  const m = Math.floor(v / 60);
  return `${m}:${String(v - m * 60).padStart(2, '0')}\u00a0min`;
}

export const personaLabel = (meta, p) => meta?.personas?.[p]?.label || p;
export const defectLabel = (meta, id) => (id ? meta?.defects?.find((d) => d.id === id)?.short || id : null);
export const outcomeLabel = (o) => (o === 'reached-payment' ? 'Reached payment' : o === 'purchased' ? 'Paid' : OUTCOME[o]?.label || o || '—');
// "Reached payment" is never shown as a purchase: neutral, not green.
export const outcomeTone = (o) => (o === 'reached-payment' ? 'muted' : OUTCOME[o]?.tone || 'muted');
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

// Problem themes, the same patterns as server/analytics.mjs, applied to demo-shop findings only.
export const THEMES = [
  ['Popups and dialogs', /popup|dialog|modal|newsletter|overlay/i],
  ['Unnamed or mislabelled controls', /unnamed|no name|accessible name|not named|label|named only|"button"/i],
  ['Keyboard and focus', /focus|keyboard|tab |tab,|shift\+tab|trap|escape/i],
  ['No feedback after an action', /feedback|announce|status|silent|confirmation|loading|nothing happen|no change/i],
  ['Payment fields and buttons', /card|iframe|pay button|payment field|pay \$|cvc|expiry/i],
];

// Everything on the analytics page comes from the demo shop. Real shops live on the Results page.
// Counted runs: demo shop, at least one step, and (when paid) paid through the PayPal sandbox.
// Runs paid with the early mock payment and runs that never started are listed but left out of every figure.
export function demoAnalytics(a, list, meta) {
  const byId = new Map((list || []).map((r) => [r.id, r]));
  const all = a.runRows.filter((r) => !r.site).map((r) => {
    const x = byId.get(r.id) || {};
    return { ...r, createdAt: x.createdAt || null, payment: x.payment || null, findings: x.findings || [], mock: x.payment?.mode === 'mock', notStarted: !r.steps };
  });
  const rows = all.filter((r) => !r.mock && !r.notStarted);
  const ids = new Set(rows.map((r) => r.id));
  const ok = (r) => r.outcome === 'purchased' || r.outcome === 'reached-payment';
  const order = Object.keys(meta?.personas || {});
  const personaList = [...new Set(rows.map((r) => r.persona))].sort((x, y) => order.indexOf(x) - order.indexOf(y));

  const paid = rows.filter((r) => r.outcome === 'purchased');
  const effort = personaList.map((p) => {
    const runs = paid.filter((r) => r.persona === p);
    return { persona: p, runs: runs.length, medianSteps: median(runs.map((r) => r.steps)), medianKeys: median(runs.map((r) => r.keys)), medianKlm: median(runs.map((r) => r.klmSeconds)) };
  });

  const matrix = { cleanBought: 0, cleanBlocked: 0, flaggedBought: 0, flaggedBlocked: 0 };
  for (const r of rows) matrix[`${(r.scanner ?? 0) === 0 ? 'clean' : 'flagged'}${ok(r) ? 'Bought' : 'Blocked'}`] += 1;

  const funnel = STAGE_ORDER.map((stage, i) => ({ stage, runs: rows.filter((r) => STAGE_ORDER.indexOf(r.furthestStage) >= i).length }));

  const personas = personaList.map((p) => {
    const runs = rows.filter((r) => r.persona === p);
    const good = runs.filter(ok);
    return { persona: p, runs: runs.length, success: good.length, blocked: runs.length - good.length, medianSteps: median(good.map((r) => r.steps)) };
  });

  const texts = rows.flatMap((r) => r.findings.map((f) => `${f.page || ''} ${f.problem || ''}`));
  const themes = THEMES.map(([theme, re]) => ({ theme, count: texts.filter((t) => re.test(t)).length }));

  // One fixed pair per customer type and defect: the latest re-run after the fix and the run it fixed.
  // Repeats of the same condition are summarised on the card, never shown as extra cards.
  const when = new Map(all.map((r) => [r.id, r.createdAt || '']));
  const best = new Map();
  for (const p of a.pairs.filter((x) => ids.has(x.before) && ids.has(x.after))) {
    const k = `${p.persona}|${p.defect}`;
    if (!best.has(k) || when.get(p.after) > when.get(best.get(k).after)) best.set(k, p);
  }
  const pairs = [...best.values()].sort((x, y) => (x.kind === 'unblocked' ? 0 : 1) - (y.kind === 'unblocked' ? 0 : 1) || order.indexOf(x.persona) - order.indexOf(y.persona));
  // Unblocked defects with the repeat runs behind them: blocked as built, paid after the fix.
  const unblocked = pairs.filter((p) => p.kind === 'unblocked').map((p) => {
    const same = (fixed) => rows.filter((r) => r.persona === p.persona && r.defect === p.defect && r.fixed === fixed);
    return { ...p, beforeRuns: same(false), afterRuns: same(true) };
  });
  const sandbox = paid.filter((r) => r.payment?.mode === 'sandbox' && r.payment.status === 'COMPLETED');

  return {
    all,
    runRows: rows,
    excluded: { mock: all.filter((r) => r.mock).length, notStarted: all.filter((r) => r.notStarted).length },
    effort,
    matrix,
    funnel,
    personas,
    themes,
    pairs,
    unblocked,
    totals: {
      runs: rows.length,
      paid: paid.length,
      sandboxOrders: sandbox.length,
      medianStepsToBuy: median(paid.map((r) => r.steps)),
      unblockedByFix: unblocked.length,
      unblockedAfterRuns: sum(unblocked.map((u) => u.afterRuns.length)),
      unblockedAfterPaid: sum(unblocked.map((u) => u.afterRuns.filter((r) => r.outcome === 'purchased').length)),
      unblockedBeforeRuns: sum(unblocked.map((u) => u.beforeRuns.length)),
      unblockedBeforeBlocked: sum(unblocked.map((u) => u.beforeRuns.filter((r) => r.outcome !== 'purchased').length)),
      blockedWhileClean: matrix.cleanBlocked,
      steps: sum(rows.map((r) => r.steps)),
      keys: sum(rows.map((r) => r.keys)),
      deadEnds: sum(rows.map((r) => r.deadEnds)),
      findings: texts.length,
    },
  };
}
