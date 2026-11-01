// The data behind an owner report. Every number here comes from run data (events, metrics, the
// fix job, the PayPal check, the axe scan); wording follows the methodologist's rules ("may not meet",
// "simulated customer", "impossible → possible", never "faster" when the before run was blocked).

import { DEFECTS } from '../shop/defects.mjs';
import { PERSONAS } from '../engine/session.mjs';
import { PAGE_PATHS } from '../shop/instances.mjs';
import { runMetrics, compareRuns, KLM } from '../metrics.mjs';
import { exportFix, HONESTY_LABEL } from '../fixer/export.mjs';
import { stuckPage } from '../fixer/fixer.mjs';
import { findCulprit, siteCulprits, stuckEvidence, AXE_VERSION } from './culprit.mjs';
import { verifyFindings } from '../verify.mjs';

export const REPORT_VERSION = 9;

// WCAG 2.2 success criteria used by the catalog and the suggestions.
export const WCAG = {
  '1.3.1': ['Info and Relationships', 'A', 'info-and-relationships'],
  '1.4.3': ['Contrast (Minimum)', 'AA', 'contrast-minimum'],
  '2.1.1': ['Keyboard', 'A', 'keyboard'],
  '2.1.2': ['No Keyboard Trap', 'A', 'no-keyboard-trap'],
  '2.4.3': ['Focus Order', 'A', 'focus-order'],
  '2.4.6': ['Headings and Labels', 'AA', 'headings-and-labels'],
  '2.4.7': ['Focus Visible', 'AA', 'focus-visible'],
  '2.4.11': ['Focus Not Obscured (Minimum)', 'AA', 'focus-not-obscured-minimum'],
  '2.5.3': ['Label in Name', 'A', 'label-in-name'],
  '2.5.8': ['Target Size (Minimum)', 'AA', 'target-size-minimum'],
  '3.2.2': ['On Input', 'A', 'on-input'],
  '3.3.1': ['Error Identification', 'A', 'error-identification'],
  '3.3.2': ['Labels or Instructions', 'A', 'labels-or-instructions'],
  '3.3.7': ['Redundant Entry', 'A', 'redundant-entry'],
  '4.1.2': ['Name, Role, Value', 'A', 'name-role-value'],
  '4.1.3': ['Status Messages', 'AA', 'status-messages'],
};

export function wcagList(text) {
  const scs = [...new Set(String(text || '').match(/\b\d\.\d\.\d{1,2}\b/g) || [])];
  return scs.map((sc) => {
    const w = WCAG[sc];
    return w ? { sc, name: w[0], level: w[1], url: `https://www.w3.org/WAI/WCAG22/Understanding/${w[2]}.html` } : { sc, name: '', level: '', url: 'https://www.w3.org/TR/WCAG22/' };
  });
}

// What the check without AI found for a finding (server/verify.mjs), in the words the console uses.
const CHECK_LABEL = {
  confirmed: 'Confirmed by the record of the run',
  partly: 'axe-core flags this kind of problem on this page',
  'not-confirmed': 'Not confirmed by the record of the run',
  manual: 'Needs a person to check it in the replay',
};

export const CUSTOMER = {
  keyboard: 'keyboard-only customer',
  screenreader: 'screen reader customer',
  agent: 'AI shopping agent',
};
export const customer = (p) => CUSTOMER[p] || PERSONAS[p]?.label || p;

// How to confirm each catalog defect by hand (methodologist 5.1, item 9).
const CHECKS = {
  'div-pay-button': ['Open the payment page and press Tab until focus passes the card fields.', 'Focus should land on Pay; Enter should submit the payment.', 'In the browser accessibility inspector, Pay should be a button named "Pay …".'],
  'focus-trap-modal': ['Open the cart with a product in it and wait for the popup.', 'Press Tab: focus should reach the Close button.', 'Press Escape: the popup should close and focus should return to where it was.'],
  'meaningless-button-names': ['Inspect each add-to-cart button: its name should include the product.', 'With a screen reader, list the buttons: each should be distinguishable.'],
  'silent-validation': ['Submit the checkout form with a field left empty.', 'Focus should move to the first error, and a screen reader should announce it.'],
  'unnamed-checkout-link': ['Inspect the Checkout link: its accessible name should be "Checkout".'],
  'custom-country-dropdown': ['Tab to Country and use the arrow keys: the list should open and an option should be selectable without a mouse.'],
  'swapped-labels': ['Click each label: it should focus its own field (Full name to name, Email to email).'],
  'fake-terms-checkbox': ['Tab to the terms checkbox and press Space: it should become checked, and be announced as a checkbox.'],
  'placeholder-only-card-fields': ['Type into each card field: a visible label should remain once the placeholder is gone.'],
  'mousedown-add-to-cart': ['Tab to an add-to-cart button and press Enter, then Space: the item should be added each time.'],
  'unlabeled-city-field': ['Inspect the City field: it should have a label named "City".'],
  'focus-lost-on-update': ['Change a quantity with the keyboard: focus should stay on the quantity field after the cart updates.'],
};

// Real sites: a suggestion per finding, by the kind of problem the customer described. Not verified.
const SUGGEST = [
  [/payment gateway|not configured/i, 'No accessibility change: the demo store has no payment method configured. This is a demo set-up, not a defect, and it is not counted as a blocker.', ''],
  [/iframe/i, 'Give every iframe a title that says what it holds (for example "Card number"), so customers and agents can find each field.', '4.1.2'],
  [/no (accessible )?names?|unnamed|have no names|not named|only an image|no visible-label|named by an error/i, 'Give each control an accessible name that matches its visible label: a <label for> on form fields, text or aria-label on icon buttons and links.', '4.1.2, 2.5.3'],
  [/label/i, 'Tie each visible label to its field with <label for> (or wrap the field in the label), so the label is the field\'s name.', '1.3.1, 3.3.2'],
  [/error|rejected|not a valid/i, 'Link each error message to its field with aria-describedby, mark the field aria-invalid, and move focus to the first error.', '3.3.1'],
  [/announce|confirmation|no status|silently|loading|nothing happened|stayed the same|no clear sign/i, 'Announce changes that happen without a full page load (added to cart, saving, page changed) through a role="status" region, and move focus to the new page heading.', '4.1.3'],
  [/dialog|popup|pop-up|consent/i, 'Open dialogs as role="dialog" with aria-modal, move focus into them, close them with Escape and return focus afterwards.', '2.1.2, 2.4.3'],
  [/selected|which one/i, 'Expose the selected option with a native radio group, aria-pressed or aria-current.', '4.1.2'],
  [/disabled/i, 'Say next to a disabled button what is missing, or keep it enabled and report what is missing when pressed.', '3.3.2'],
  [/same name|indistinguishable|doubled|repeated/i, 'Keep accessible names unique and clean: "Edit address" and "Edit delivery" instead of two "Edit" buttons; no repeated words.', '2.4.6'],
  [/changed names|changed to|became|jumped/i, 'Keep field names and order stable while the form updates; warn before the total changes.', '3.2.2'],
  [/sold out/i, 'Show availability where the product is listed, as text, not only on the product page.', ''],
];

export function suggestFor(problem) {
  const hits = SUGGEST.filter(([re]) => re.test(problem)).slice(0, 2);
  if (!hits.length) return [{ text: 'Review this step with a keyboard and a screen reader and confirm the finding before changing code.', wcag: [] }];
  return hits.map(([, text, w]) => ({ text, wcag: wcagList(w) }));
}

// Removes tokens from a URL: no query string, long random path segments shortened.
export function cleanUrl(u) {
  try {
    const url = new URL(u);
    const segs = url.pathname.split('/').map((s) => (s.length > 16 && /[A-Za-z]/.test(s) && /\d/.test(s) ? '…' : s));
    const step = url.searchParams.get('step');
    return `${url.host}${segs.join('/')}${step ? ` (step: ${step})` : ''}`;
  } catch { return String(u || ''); }
}

const lower1 = (s) => String(s || '').charAt(0).toLowerCase() + String(s || '').slice(1);
const plural = (n, w, pl = `${w}s`) => `${n} ${n === 1 ? w : pl}`;
const pageLabel = (p) => ({ catalog: 'shop', cart: 'cart', checkout: 'checkout', pay: 'payment', done: 'confirmation' }[p] || p);

function stepLog(run) {
  const ev = run.events || [];
  const rows = [];
  for (const d of ev.filter((e) => e.type === 'decide')) {
    const o = ev.find((e) => e.type === 'observe' && e.step === d.step);
    const a = ev.find((e) => e.type === 'act' && e.step === d.step);
    rows.push({ step: d.step, where: run.site ? (o?.title || '') : (o?.path || ''), action: d.action, args: d.args || {}, thought: d.thought || '', result: a?.result || (d.final ? '(finished)' : ''), ok: a ? (a.ok ?? !/did not work|There is no|cannot take keyboard focus|not available|Nothing was typed|Not allowed/.test(a.result || '')) : null, final: !!d.final });
  }
  return rows;
}

// A few lines of what the customer perceived around the element (or the top of the page).
function perceivedExcerpt(text, needle) {
  const lines = String(text || '').split('\n');
  let i = needle ? lines.findIndex((l) => l.includes(needle)) : -1;
  if (i < 0) i = lines.findIndex((l) => /main:|Keyboard focus:/.test(l));
  const from = Math.max(0, i - 10);
  const out = lines.slice(from, from + 22);
  const kf = lines.find((l) => l.startsWith('Keyboard focus:'));
  if (kf && !out.includes(kf)) out.push('…', kf);
  return (from > 0 ? '…\n' : '') + out.join('\n');
}

function describeElement(el) {
  if (!el) return '';
  const name = el.name ? `"${el.name}"` : 'An element with no name';
  return `${name} is a <${el.tag}>${el.role ? ` with role ${el.role}` : ' with no role'}${el.focusable ? '' : ', and Tab cannot reach it'}.`;
}

function scorecard(run, rerun, baseline) {
  const human = run.persona !== 'agent';
  const cols = [{ key: 'before', title: rerun ? 'Before the fix' : 'This run', run }];
  if (rerun) cols.push({ key: 'after', title: 'After the fix', run: rerun });
  if (baseline && rerun) cols.push({ key: 'baseline', title: 'Shop without this defect', run: baseline });
  const m = cols.map((c) => ({ ...c, m: runMetrics(c.run) }));
  const recordedBrowser = cols.some((c) => (c.run.events || []).some((e) => e.type === 'act' && e.actMs));
  const outcome = (r) => {
    const s = r.outcome?.status;
    if (s === 'purchased') return r.payment ? (r.payment.mode === 'owner-sandbox' ? `Paid (the shop's PayPal sandbox: ${r.payment.status})` : `Paid (PayPal ${r.payment.mode} ${r.payment.status})`) : 'Paid';
    if (s === 'reached-payment') return 'Reached payment (stopped, nothing paid)';
    if (s === 'not-testable') return 'Not testable (bot protection or robots.txt)';
    if (s === 'blocked') return r.outcome?.claimedDone ? 'Could not pay (claimed done, no order)' : 'Could not pay (gave up)';
    return s || '—';
  };
  const rows = [
    { label: 'Outcome', values: m.map((c) => outcome(c.run)) },
    { label: 'Furthest stage reached', values: m.map((c) => c.m.furthestStage) },
    { label: 'Steps (decisions)', values: m.map((c) => c.m.steps) },
  ];
  if (human) {
    rows.push({ label: 'Keys pressed', values: m.map((c) => c.m.keys) });
    rows.push({ label: 'Tab presses', values: m.map((c) => c.m.tabs) });
  }
  rows.push({ label: 'Failed actions', values: m.map((c) => c.m.deadEnds) });
  rows.push({ label: 'Actions with no perceivable effect', values: m.map((c) => c.m.noEffect) });
  rows.push({ label: 'Longest stretch without a new page state', values: m.map((c) => plural(c.m.longestStall, 'step')) });
  if (run.persona === 'screenreader') rows.push({ label: 'Words heard', values: m.map((c) => c.m.wordsHeard) });
  rows.push({ label: 'Time the site made the customer wait', values: m.map((c) => (recordedBrowser ? `${c.m.browserSeconds} s` : 'not recorded in this run')) });
  if (human) rows.push({ label: 'Estimated time for this path (keystroke-level model)', values: m.map((c) => (c.m.success && c.m.klmSeconds != null ? `${Math.floor(c.m.klmSeconds / 60)} min ${c.m.klmSeconds % 60} s (estimate)` : 'not applicable: did not finish')) });
  rows.push({ label: run.site ? 'axe-core violations on the pages it saw' : 'axe-core violations on the checkout pages', values: m.map((c) => c.m.scanner ?? '—') });
  let claim = null;
  if (rerun) {
    const cmp = compareRuns(run, rerun);
    if (cmp.kind === 'unblocked') claim = { kind: 'unblocked', label: 'impossible → possible', text: `Before the fix the ${customer(run.persona)} could not pay; after it, the same customer with the same task on the same shop paid. The before run never reached a payment, so there is nothing to compare its time with: this is not a "faster" claim.` };
    else if (cmp.kind === 'regressed') claim = { kind: 'regressed', label: 'possible → impossible', text: 'The customer paid before the change and could not pay after it.' };
    else claim = { kind: 'effort', label: 'same outcome, effort compared', text: `Both runs ended the same way. Change in steps: ${cmp.delta.steps > 0 ? '+' : ''}${cmp.delta.steps}. One run per condition: treat this as an observation, not an average.` };
    if (baseline && runMetrics(rerun).steps === runMetrics(baseline).steps) claim.baseline = `After the fix the path is the same length as on the shop without the defect: ${plural(runMetrics(rerun).steps, 'step')} (run ${baseline.id}).`;
  }
  return { columns: m.map((c) => ({ key: c.key, title: c.title, runId: c.run.id })), rows, claim };
}

function methodNotes(run, fix) {
  const brain = run.brainKind === 'external' ? 'a Claude Code agent (it reads each turn and replies with one action)' : run.brainKind === 'anthropic' ? `the Claude API (${run.model || 'model not recorded'})` : run.brainKind === 'scripted' ? 'a fixed script (no AI), used for tests' : run.brainKind;
  const p = PERSONAS[run.persona];
  const notes = [
    `Customer model: ${p?.label || run.persona}. ${p?.summary || ''}`,
    `Who decided each step: ${brain}. The customer model gets only what that kind of customer perceives (no pixels, no HTML).`,
    run.site ? 'Real site: the run stops at the payment step. Nothing is paid, no order is placed, no account is created, and card fields are never typed into; payment providers are blocked at the network level.' : `Payment: PayPal ${run.paypalMode || 'sandbox'}${run.paypalMode === 'sandbox' ? ' (test money). A purchase counts only when PayPal reports the order as COMPLETED' : ''}.`,
    `Scanner: axe-core ${AXE_VERSION}, default rules (WCAG A and AA plus best practices), ${run.site ? 'on each page the customer saw, in the state it saw it' : 'on the same shop pages with the same defects and fixes, with a filled cart'}.`,
  ];
  if (fix) notes.push(`Fix: proposed by ${fix.fixer === 'external' ? 'a Claude Code agent' : fix.fixer} from the exact HTML of the page and the customer's transcript. Each patch must match the page text exactly once; ${plural(fix.accepted?.length || 0, 'patch', 'patches')} accepted, ${fix.rejected?.length || 0} rejected.`);
  return notes;
}

const LIMITS = [
  'AccessiPay simulates customers with AI models. Our screen reader and keyboard customers are models of how assistive technology exposes a page, not people with disabilities, and they do not replace testing with disabled users.',
  'The keyboard customer is told where focus is from the page itself, so it is not affected by an invisible focus indicator; a real sighted keyboard user may see less.',
  'The screen reader customer gets the whole accessibility tree at each step and does not hear live announcements, so its step counts are a lower bound.',
  `Times for people are estimates from the keystroke-level model (K = ${KLM.keystroke} s per key, M = ${KLM.mental} s per decision, listening at ${KLM.wordsPerMinute} words a minute; Card, Moran and Newell). They are for the path the model took, errors included, and are not measured human times. AI thinking time is never shown as customer time.`,
  'Each condition here was run once unless stated otherwise: a single run is an observation, not an average.',
  'WCAG references say a page may not meet a criterion; confirm with manual testing. This report is not a conformance claim.',
];

async function blockerFor({ n, run, fix, rerun, ctx }) {
  const culprit = await findCulprit({ run, fix, shop: ctx.shop, browser: ctx.browser, origin: ctx.origin, dataDir: ctx.dataDir });
  const stuck = stuckEvidence(run);
  const page = culprit.page || (run.site ? stuck.lastObserve?.title : null);
  const defects = run.site ? [] : DEFECTS.filter((d) => (run.defects || []).includes(d.id) && d.page === page && d.blocks.includes(run.persona));
  const anyDefects = run.site ? [] : DEFECTS.filter((d) => (run.defects || []).includes(d.id) && d.page === page);
  const primary = culprit.elements?.find((e) => e.n === culprit.primary) || null;
  const lastDecide = [...stuck.decides].reverse().find((d) => d.thought);
  const loop = culprit.loop || stuck.loop;
  const evidence = loop
    ? `Focus cycled between ${loop.stops.map((s) => s.replace(/ next to the text .*/, '').replace(/ \[.*\]/, '')).join(' and ')} (${loop.moves} moves).`
    : culprit.missing ? `The ${customer(run.persona)} found no ${culprit.missing.role || 'control'} named "${culprit.missing.name}".`
      : lastDecide ? `Its last thought: "${lastDecide.thought}"` : '';
  const short = defects[0]?.short || (stuck.lastObserve ? `Stopped on the ${run.site ? stuck.lastObserve.title : pageLabel(page)} page` : 'Where the customer stopped');
  const marks = [];
  if (primary) marks.push({ n, kind: 'blocker', box: primary.box, title: short, note: `${describeElement(primary)} ${evidence}`.trim() });
  else marks.push({ n, kind: 'blocker', box: null, title: short, note: evidence || 'The run has no recorded element position.' });
  for (const e of culprit.elements || []) if (e !== primary && e.box && e.role_in_report === 'container') marks.push({ n: `${n}`, kind: 'context', box: e.box });
  for (const s of culprit.scannerBoxes || []) marks.push({ kind: 'scanner', box: s.box, title: s.rule });
  const where = run.site ? stuck.lastObserve?.title : `${pageLabel(page)} page`;
  const caption = culprit.image?.origin === 'rerender'
    ? `The ${where} (${culprit.path || ''}) rendered again ${fix ? 'without the fix' : 'with the same defects'}, with the same cart and shipping details. Red: where the simulated ${customer(run.persona)} got stuck. Blue dashed: what axe-core ${AXE_VERSION} flagged on this screen.`
    : `Screenshot of step ${culprit.step} of run ${run.id}, the ${where}.${primary ? '' : ' This run did not record element positions, so the place is described, not circled.'}`;

  const pageScan = culprit.scan || (run.scan?.pages || []).find((p) => p.page === page)?.violations || [];
  const pageRules = pageScan.map((v) => v.id);
  const flagged = primary?.scannerRules?.length ? primary.scannerRules : [];
  const scannerText = culprit.scanError ? `The scan of this page failed: ${culprit.scanError}.`
    : flagged.length ? `Flagged by axe-core ${AXE_VERSION}: ${flagged.join(', ')}.`
      : `Not flagged by axe-core ${AXE_VERSION}. On this page it reported ${plural(pageScan.reduce((s, v) => s + (v.nodes || 0), 0), 'violation')}${pageRules.length ? ` (${pageRules.join(', ')})` : ''}${pageRules.length ? ', none on this element' : ''}.`;

  const m = runMetrics(run);
  const tried = stuck.decides.map((d) => ({ step: d.step, action: d.action, args: d.args || {}, result: stuck.acts.find((a) => a.step === d.step)?.result || '', thought: d.thought || '' }));
  const pageTitle = stuck.lastObserve?.title;
  const words = [
    ...(run.findings || []).filter((f) => f.page === pageTitle).map((f) => f.problem),
    ...stuck.decides.filter((d) => d.thought).slice(-3).map((d) => `Step ${d.step}: ${d.thought}`),
  ];
  const ex = fix ? exportFix({ job: fix, run, rerun, shop: ctx.shop }) : null;
  const wcag = wcagList(defects.map((d) => d.wcag).join(', ') || anyDefects.map((d) => d.wcag).join(', '));
  return {
    n,
    title: defects[0]?.title || `The ${customer(run.persona)} could not continue on the ${where}`,
    short,
    impact: 'Blocker: the customer could not finish the purchase.',
    customers: { observed: [run.persona], expected: [...new Set(defects.flatMap((d) => d.blocks))].filter((p) => p !== run.persona) },
    wcag,
    where: { page, path: culprit.path || stuck.lastObserve?.path || '', url: run.site ? cleanUrl(stuck.lastObserve?.url) : null, selector: primary?.selector || null, outer: primary?.outer || null, role: primary ? (primary.role || 'none') : null, name: primary ? (primary.name || '(no name)') : null, focusable: primary?.focusable ?? null },
    // Re-rendered pages are scanned on the spot; recorded step screenshots only have boxes from newer runs.
    figure: culprit.image ? { src: culprit.image.url, width: culprit.image.width, height: culprit.image.height, marks, caption, scannerRecorded: culprit.image.origin === 'rerender' || !!culprit.scannerBoxes?.length } : null,
    confidence: culprit.confidence,
    culpritSource: culprit.source,
    note: culprit.note || null,
    steps: stuck.steps,
    perceived: perceivedExcerpt(stuck.lastObserve?.text, primary?.name),
    perceivedStep: stuck.last,
    words,
    tried,
    metricEvidence: `${plural(m.deadEnds, 'action')} failed, ${plural(m.noEffect, 'action')} changed nothing the customer could perceive, and the most repeated page state was seen ${plural(m.mostRepeatedState, 'time')}.`,
    scanner: scannerText,
    fix: ex ? { summary: fix.summary, changes: ex.changes } : null,
    verification: rerun ? { runId: rerun.id, outcome: rerun.outcome?.status, steps: rerun.steps, payment: rerun.payment || null } : null,
    check: defects.flatMap((d) => CHECKS[d.id] || []),
  };
}

export async function buildReport({ kind, id, ctx }) {
  const get = (rid) => { const r = ctx.runs.get(rid); return r ? (r.brain ? ctx.runs.plain(r) : r) : null; };
  const run = get(id);
  if (!run) { const e = new Error('Run not found'); e.status = 404; throw e; }
  if (run.status && run.status !== 'finished') { const e = new Error('The run is still going'); e.status = 409; throw e; }
  if (run.site || kind === 'site') {
    if (!run.site) { const e = new Error('Not a real-site run'); e.status = 400; throw e; }
    return buildSite({ run, ctx });
  }
  const fix = (ctx.fixes?.list() || []).filter((j) => j.runId === run.id && j.status === 'applied').at(-1) || null;
  const list = ctx.runs.list();
  let rerunSummary = null;
  if (fix) {
    rerunSummary = list.filter((r) => (r.label || '').includes(`fix ${fix.id}`) && r.status === 'finished').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
      || list.filter((r) => r.instanceId === run.instanceId && r.id !== run.id && r.patches?.length && r.createdAt > run.createdAt && r.status === 'finished').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] || null;
  }
  const rerun = rerunSummary ? get(rerunSummary.id) : null;
  const goal = (r) => r.goalId || 'checkout';
  const baseSummary = list.find((r) => !r.site && r.persona === run.persona && goal(r) === goal(run) && !(r.defects || []).length && !(r.patches || []).length && r.outcome?.status === 'purchased' && r.payment?.status === 'COMPLETED');
  const baseline = baseSummary ? get(baseSummary.id) : null;
  const blocked = run.outcome?.status === 'blocked';
  const isCase = !!(fix && blocked);
  const who = customer(run.persona);
  const defects = DEFECTS.filter((d) => (run.defects || []).includes(d.id));
  const scanTotal = run.scan?.totalViolations;
  const ex = fix ? exportFix({ job: fix, run, rerun, shop: ctx.shop }) : null;

  let headline;
  if (blocked && rerun?.outcome?.status === 'purchased') headline = `Our simulated ${who} could not pay. After ${plural(fix.accepted.length, 'change')} to the ${pageLabel(fix.page)} page it paid${rerun.payment ? `: PayPal ${rerun.payment.mode} order ${rerun.payment.orderId} is ${rerun.payment.status}` : ''}.`;
  else if (blocked && fix) headline = `Our simulated ${who} could not pay. A fix of ${plural(fix.accepted.length, 'change')} is ready${rerun ? `; the re-run ended "${rerun.outcome?.status}"` : ' and has not been re-run yet'}.`;
  else if (blocked) headline = `Our simulated ${who} could not pay. It stopped on the ${pageLabel(stuckPage(run))} page after ${plural(run.steps ?? runMetrics(run).steps, 'step')}.`;
  else if (run.outcome?.status === 'purchased') headline = `Our simulated ${who} paid in ${plural(run.steps ?? runMetrics(run).steps, 'step')}${run.payment ? `: PayPal ${run.payment.mode} order ${run.payment.orderId} is ${run.payment.status}` : ''}.`;
  else headline = `The run ended "${run.outcome?.status}": ${run.outcome?.reason || ''}`;
  const sub = scanTotal != null ? `axe-core ${AXE_VERSION} reported ${plural(scanTotal, 'violation')} on the ${plural(run.scan?.pages?.length || 0, 'checkout page')} of the same shop${blocked ? ' before the fix' : ''}.` : 'The scanner did not run for this run.';

  const blockers = blocked ? [await blockerFor({ n: 1, run, fix, rerun, ctx })] : [];
  const friction = (blocked ? [] : (run.findings || [])).map((f, i) => ({ n: i + 1, page: f.page, problem: f.problem }));
  const otherFindings = blocked ? (run.findings || []).filter((f) => !blockers.some((b) => b.words.includes(f.problem))) : [];

  return {
    version: REPORT_VERSION,
    kind: isCase ? 'case' : 'run',
    requested: kind,
    id: run.id,
    title: isCase ? 'Checkout case report' : 'Checkout run report',
    target: { label: 'AccessiPay demo shop (Pine and Peak Outfitters)', defects: defects.map((d) => ({ id: d.id, short: d.short, title: d.title })) },
    date: run.createdAt,
    customers: [run.persona],
    who,
    run: { id: run.id, persona: run.persona, outcome: run.outcome, steps: run.steps, payment: run.payment || null, label: run.label, createdAt: run.createdAt, brainKind: run.brainKind, model: run.model, recorded: !!run.recorded },
    fix: fix ? { id: fix.id, page: fix.page, summary: fix.summary, accepted: fix.accepted.length, rejected: fix.rejected?.length || 0, fixer: fix.fixer } : null,
    rerun: rerun ? { id: rerun.id, outcome: rerun.outcome, steps: rerun.steps, payment: rerun.payment || null, createdAt: rerun.createdAt } : null,
    baseline: baseline ? { id: baseline.id, steps: baseline.steps } : null,
    verdict: { headline, sub, blocked, paidAfter: rerun?.outcome?.status === 'purchased' },
    scorecard: scorecard(run, rerun, baseline),
    changes: ex ? ex.changes : [],
    changesSource: ex ? ex.json.source : null,
    honesty: HONESTY_LABEL,
    blockers,
    friction,
    otherFindings,
    scanner: { version: AXE_VERSION, total: scanTotal ?? null, pages: (run.scan?.pages || []).map((p) => ({ page: p.page, url: p.url || PAGE_PATHS[p.page] || '', violations: Array.isArray(p.violations) ? p.violations.reduce((s, v) => s + v.nodes, 0) : p.violations, rules: Array.isArray(p.violations) ? p.violations.map((v) => v.id) : p.rules || [] })) },
    method: methodNotes(run, fix),
    limits: LIMITS,
    steps: stepLog(run),
    rerunSteps: rerun ? stepLog(rerun) : null,
    links: {
      runView: `/#/runs/${run.id}`,
      pdf: `/api/report/${isCase ? 'case' : 'run'}/${run.id}.pdf`,
      patch: fix ? `/api/fixes/${fix.id}/fix.patch` : null,
      json: fix ? `/api/fixes/${fix.id}/changes.json` : null,
      md: fix ? `/api/fixes/${fix.id}/changes.md` : null,
      case: isCase ? `/report/case/${run.id}` : null,
      rerunView: rerun ? `/#/runs/${rerun.id}` : null,
    },
  };
}

function buildSite({ run, ctx }) {
  const places = siteCulprits({ run, dataDir: ctx.dataDir });
  const scanPages = (run.scan?.pages || []).map((p) => ({ url: cleanUrl(p.url), rawStage: p.url, violations: p.violations, rules: p.rules || [], frameNote: p.violations === 0 && /checkout|payment/i.test(p.url) ? 'Payment fields on this page are in third-party frames; axe-core does not look inside cross-origin frames, so 0 may mean "not scanned", not "clean".' : null }));
  const ev = run.events || [];
  // The same check without AI that the shop's analysis page shows, so the report and the page agree.
  const checks = run.status === 'finished' ? verifyFindings(run) : [];
  const findings = (run.findings || []).map((f, i) => {
    const pl = places[i];
    const obs = ev.find((e) => e.type === 'observe' && e.step === pl.step);
    const pageScan = (run.scan?.pages || []).find((p) => p.url === obs?.url);
    const suggestion = suggestFor(f.problem);
    const notDefect = /payment gateway|not configured/i.test(f.problem);
    return {
      n: i + 1,
      page: f.page,
      url: pl.url ? cleanUrl(pl.url) : null,
      step: pl.step,
      problem: f.problem,
      element: f.element || null,
      figure: pl.image ? { src: pl.image.url, width: pl.image.width, height: pl.image.height, marks: [{ n: i + 1, kind: notDefect ? 'friction' : 'blocker', box: pl.box, title: f.page.split('|')[0].trim().slice(0, 34), note: f.problem }], scannerRecorded: false, caption: `Screenshot of step ${pl.step}, ${f.page}.${pl.box ? '' : ' This run did not record element positions, so the finding is placed on the page, not circled.'}` } : null,
      perceived: perceivedExcerpt(obs?.text, f.element?.name),
      confidence: CHECK_LABEL[checks[i]?.status] || CHECK_LABEL.manual,
      check: checks[i] ? { status: checks[i].status, by: checks[i].by, evidence: checks[i].evidence } : null,
      scanner: pageScan ? (pageScan.violations === null ? 'This page could not be scanned.' : `axe-core reported ${plural(pageScan.violations, 'violation')} on this page${pageScan.rules?.length ? ` (${pageScan.rules.join(', ')})` : ''}.`) : 'axe-core did not scan this page in this run.',
      suggestion,
      notDefect,
    };
  });
  const m = runMetrics(run);
  const paid = run.outcome?.status === 'purchased' && run.payment?.status === 'COMPLETED';
  const reached = run.outcome?.status === 'reached-payment' || paid;
  const host = run.site.host;
  const who = customer(run.persona);
  const headline = paid
    ? `Our simulated ${who} bought on ${host} in ${plural(m.steps, 'step')} and paid with a PayPal test card; the shop's own PayPal sandbox reports order ${run.payment.orderId} as COMPLETED.`
    : reached
    ? `Our simulated ${who} reached the payment step of ${host} in ${plural(m.steps, 'step')} and stopped there; nothing was paid.`
    : `Our simulated ${who} did not reach a payment form on ${host}: ${lower1(run.outcome?.reason || '').replace(/^the agent /, 'it ')}`;
  return {
    version: REPORT_VERSION,
    kind: 'site',
    requested: 'site',
    id: run.id,
    title: 'Real-site checkout report',
    target: { label: host, url: run.site.url, host },
    date: run.createdAt,
    customers: [run.persona],
    who: customer(run.persona),
    run: { id: run.id, persona: run.persona, outcome: run.outcome, steps: run.steps, brainKind: run.brainKind, model: run.model, recorded: !!run.recorded, label: run.label, createdAt: run.createdAt },
    verdict: { headline, sub: run.scan ? `axe-core ${AXE_VERSION} reported ${plural(run.scan.totalViolations, 'violation')} across the ${plural(run.scan.pages?.length || 0, 'page')} the customer saw, scanned in the state it saw them.` : 'No scan was recorded.', blocked: !reached },
    scorecard: scorecard(run, null, null),
    findings,
    scanner: { version: AXE_VERSION, total: run.scan?.totalViolations ?? null, pages: scanPages },
    method: methodNotes(run, null),
    limits: [
      ...LIMITS,
      'Findings on a real site are reported by the AI customer. Each one is checked again without AI against the record of its run, and its label says what that check found. Suggested changes are not verified on the site.',
      'A stop is not always an accessibility defect: a demo store can be missing a payment method or stock.',
    ],
    steps: stepLog(run),
    links: { runView: `/#/runs/${run.id}`, pdf: `/api/report/site/${run.id}.pdf` },
  };
}
