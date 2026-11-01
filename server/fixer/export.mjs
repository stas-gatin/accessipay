// Ready code from a fix job: fix.patch (git-applicable, a/pages/<page>.html b/pages/<page>.html),
// changes.json (one entry per accepted patch, with WCAG and the run and PayPal order that verified it)
// and changes.md (one ticket-ready section per change). The demo shop's pages are template strings,
// so the patch is against the HTML the browser received, not against a source file.

import { createTwoFilesPatch } from 'diff';
import { DEFECTS } from '../shop/defects.mjs';
import { PERSONAS } from '../engine/session.mjs';
import { checkoutState, tagOf, selectorOf, renderAsCustomerGot } from '../report/culprit.mjs';

export const HONESTY_LABEL = 'HTML as the browser received it; map it to your template.';

const lineOf = (html, find) => {
  const i = html.indexOf(find);
  return i < 0 ? null : html.slice(0, i).split('\n').length;
};

// Rebuilds the page the fixer saw (defects on, no patches, a customer at that point of checkout),
// and the page after the accepted patches. Returns null when a patch does not match exactly once,
// in which case the diff stored with the job is used instead.
function rebuild({ shop, job, run }) {
  if (!shop || !run) return null;
  const inst = { id: job.instanceId, defects: run.defects || [], patches: [], created: Date.now(), ...checkoutState() };
  const base = `/s/${job.instanceId}`;
  let before;
  try { before = renderAsCustomerGot({ shop, run, inst, page: job.page, base }); } catch { return null; }
  let after = before;
  for (const p of job.accepted || []) {
    if (after.split(p.find).length !== 2) return null;
    after = after.replace(p.find, () => p.replace);
  }
  return { before, after };
}

// Old-line numbers of the "-" lines in a unified diff, to place a patch when the page cannot be rebuilt.
function lineFromDiff(diff, find) {
  const first = String(find).split('\n').find((l) => l.trim()) || '';
  let old = 0;
  for (const l of String(diff || '').split('\n')) {
    const h = l.match(/^@@ -(\d+)/);
    if (h) { old = Number(h[1]); continue; }
    if (!old) continue;
    if (l.startsWith('-') && !l.startsWith('---')) { if (l.slice(1).includes(first.trim())) return old; old += 1; }
    else if (l.startsWith(' ')) old += 1;
  }
  return null;
}

function gitPatch(page, unified) {
  const file = `pages/${page}.html`;
  const body = String(unified)
    .split('\n')
    .filter((l) => !/^={10,}$/.test(l) && !/^Index: /.test(l))
    .map((l) => (l.startsWith('--- ') ? `--- a/${file}` : l.startsWith('+++ ') ? `+++ b/${file}` : l))
    .join('\n');
  return `diff --git a/${file} b/${file}\n${body.endsWith('\n') ? body : body + '\n'}`;
}

export function exportFix({ job, run = null, rerun = null, shop = null }) {
  if (!job || job.status !== 'applied') throw new Error('This fix has not been applied');
  const pageDefects = DEFECTS.filter((d) => (run?.defects || []).includes(d.id) && d.page === job.page);
  const rebuilt = rebuild({ shop, job, run });
  const unified = rebuilt
    ? createTwoFilesPatch(`a/pages/${job.page}.html`, `b/pages/${job.page}.html`, rebuilt.before, rebuilt.after, undefined, undefined, { context: 3 })
    : job.diff;
  const header = [
    `# AccessiPay fix ${job.id} for run ${job.runId}${rerun ? `, verified by re-run ${rerun.id}` : ''}.`,
    `# ${HONESTY_LABEL}`,
    `# Apply from the folder that holds pages/: git apply fix.patch`,
  ].join('\n');
  const patch = `${header}\n${gitPatch(job.page, unified)}`;

  const verifiedBy = rerun ? {
    runId: rerun.id,
    outcome: rerun.outcome?.status || null,
    steps: rerun.steps ?? null,
    paypalOrderId: rerun.payment?.orderId || null,
    paypalStatus: rerun.payment?.status || null,
    paypalMode: rerun.payment?.mode || null,
  } : null;

  const changes = (job.accepted || []).map((p, i) => {
    const t = tagOf(p.find);
    const wcag = p.wcag || [...new Set(pageDefects.map((d) => d.wcag))].join('; ') || null;
    return {
      id: p.id,
      n: i + 1,
      page: job.page,
      file: `pages/${job.page}.html`,
      line: rebuilt ? lineOf(rebuilt.before, p.find) : lineFromDiff(job.diff, p.find),
      element: p.element || (t ? { selector: selectorOf(t), tag: t.tag } : { selector: null, tag: null, note: 'script or text change' }),
      wcag,
      defects: pageDefects.map((d) => d.id),
      why: p.why,
      before: p.find,
      after: p.replace,
      personas: {
        observed: run ? [run.persona] : [],
        expected: [...new Set(pageDefects.flatMap((d) => d.blocks))].filter((x) => x !== run?.persona),
      },
      verifiedBy,
    };
  });

  const json = {
    fix: job.id,
    run: job.runId,
    page: job.page,
    file: `pages/${job.page}.html`,
    summary: job.summary || '',
    label: HONESTY_LABEL,
    source: rebuilt ? 'rebuilt from the shop with the same defects and cart' : 'diff stored with the fix',
    verifiedBy,
    changes,
  };

  const personaName = (k) => PERSONAS[k]?.label || k;
  const fence = (s) => (String(s).includes('```') ? '~~~~' : '```');
  const md = [
    `# Changes for pages/${job.page}.html`,
    '',
    `Fix ${job.id} for run ${job.runId}. ${job.summary || ''}`.trim(),
    '',
    `> ${HONESTY_LABEL}`,
    '',
    verifiedBy ? `Verified: re-run ${verifiedBy.runId} ended "${verifiedBy.outcome}"${verifiedBy.paypalOrderId ? `; PayPal ${verifiedBy.paypalMode} order ${verifiedBy.paypalOrderId} is ${verifiedBy.paypalStatus}` : ''}.` : 'Not verified by a re-run yet.',
    '',
    ...changes.flatMap((c) => [
      `## ${c.n}. ${c.element.selector ? `\`${c.element.selector}\`` : 'Script change'}${c.line ? ` (line ${c.line})` : ''}`,
      '',
      `Why: ${c.why}`,
      '',
      c.wcag ? `WCAG 2.2: may not meet ${c.wcag}; confirm with manual testing.` : 'WCAG: not mapped.',
      '',
      `Customers: observed blocked in a run: ${c.personas.observed.map(personaName).join(', ') || 'none'}; expected, not tested: ${c.personas.expected.map(personaName).join(', ') || 'none'}.`,
      '',
      'Before:',
      '',
      `${fence(c.before)}html`, c.before, fence(c.before),
      '',
      'After:',
      '',
      `${fence(c.after)}html`, c.after, fence(c.after),
      '',
    ]),
  ].join('\n');

  return { patch, json, md, changes };
}
