// Aggregates for the analytics page, computed from every finished run on disk (live and recorded).

export const STAGES = ['Browse', 'Cart', 'Checkout', 'Payment', 'Paid'];

const THEMES = [
  ['Popups and dialogs', /popup|dialog|modal|newsletter|overlay/i],
  ['Unnamed or mislabelled controls', /unnamed|no name|accessible name|not named|label|named only|"button"/i],
  ['Keyboard and focus', /focus|keyboard|tab |tab,|shift\+tab|trap|escape/i],
  ['No feedback after an action', /feedback|announce|status|silent|confirmation|loading|nothing happen|no change/i],
  ['Payment fields and buttons', /card|iframe|pay button|payment field|pay \$|cvc|expiry/i],
];

function stageOf(run) {
  if (run.outcome?.status === 'purchased' || run.outcome?.status === 'wrong-item') return 4;
  if (run.outcome?.status === 'reached-payment') return 3;
  let max = 0;
  for (const e of run.events || []) {
    if (e.type !== 'observe') continue;
    const where = (e.url || e.path || '').toLowerCase();
    let s = 0;
    if (/\/pay(\b|$)|payment/.test(where)) s = 3;
    else if (/checkout/.test(where)) s = 2;
    else if (/cart|bag|basket/.test(where)) s = 1;
    max = Math.max(max, s);
  }
  return max;
}

export function analytics(runs) {
  const done = runs.filter((r) => r && r.status === 'finished' && r.outcome && r.brainKind !== 'scripted' && r.outcome.status !== 'error' && r.outcome.status !== 'stopped');
  const success = (r) => ['purchased', 'reached-payment'].includes(r.outcome.status);
  const demo = done.filter((r) => !r.site);
  const real = done.filter((r) => r.site);

  const personas = {};
  for (const r of done) {
    const p = (personas[r.persona] ||= { persona: r.persona, runs: 0, success: 0, blocked: 0, steps: [] });
    p.runs += 1;
    if (success(r)) { p.success += 1; p.steps.push(r.steps || 0); } else p.blocked += 1;
  }

  const funnel = STAGES.map((name, i) => ({ stage: name, runs: demo.filter((r) => stageOf(r) >= i).length }));

  const matrix = { cleanBought: 0, cleanBlocked: 0, flaggedBought: 0, flaggedBlocked: 0 };
  for (const r of demo) {
    const clean = (r.scan?.totalViolations ?? 0) === 0;
    const ok = success(r);
    matrix[`${clean ? 'clean' : 'flagged'}${ok ? 'Bought' : 'Blocked'}`] += 1;
  }

  const findings = done.flatMap((r) => (r.findings || []).map((f) => `${f.page || ''} ${f.problem || ''}`));
  const themes = THEMES.map(([theme, re]) => ({ theme, count: findings.filter((f) => re.test(f)).length }));

  const sites = real.map((r) => ({
    id: r.id, host: r.site.host, persona: r.persona, outcome: r.outcome.status, steps: r.steps,
    pages: r.scan?.pages?.length || 0, violations: r.scan?.totalViolations ?? null,
    rules: [...new Set((r.scan?.pages || []).flatMap((p) => p.rules || []))],
    findings: (r.findings || []).length, stage: STAGES[stageOf(r)],
  }));

  const stepsToBuy = demo.filter(success).map((r) => r.steps || 0).sort((a, b) => a - b);
  const median = stepsToBuy.length ? stepsToBuy[Math.floor(stepsToBuy.length / 2)] : null;

  return {
    totals: {
      runs: done.length,
      demoRuns: demo.length,
      realRuns: real.length,
      paid: demo.filter((r) => r.outcome.status === 'purchased').length,
      blockedWhileClean: matrix.cleanBlocked,
      sites: new Set(real.map((r) => r.site.host)).size,
      medianStepsToBuy: median,
      findings: findings.length,
      sandboxOrders: demo.filter((r) => r.payment?.mode === 'sandbox' && r.payment.status === 'COMPLETED').length,
    },
    personas: Object.values(personas).map(({ steps, ...p }) => ({ ...p, medianSteps: steps.length ? steps.sort((a, b) => a - b)[Math.floor(steps.length / 2)] : null })),
    funnel,
    matrix,
    themes,
    sites,
  };
}
