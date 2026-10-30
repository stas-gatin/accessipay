// Turns the flat event list of a run into steps the theater can show, one per observe/decide/act turn.
// Works on old recorded runs too: stage, keys, ok and browser time are derived when they are missing.

import { STAGES, stageOfPage } from '../../../shared/stages.js';
import { FAILED, narrate } from '../../../shared/narrate.js';

export { STAGES };
export const VIEWPORT = { width: 1280, height: 860 };

function keysFor(action, args = {}) {
  if (['next', 'prev', 'activate', 'press'].includes(action)) return 1;
  if (action === 'type') return String(args.text ?? '').length + 1;
  if (action === 'jump') return 2;
  return 0;
}

const ms = (a, b) => (a && b ? Math.max(0, Date.parse(b) - Date.parse(a)) : 0);

export function buildSteps(events, run) {
  const external = !!run?.site;
  const map = new Map();
  const at = (n) => { if (!map.has(n)) map.set(n, { n }); return map.get(n); };
  let closing = null;
  let startT = null;
  for (const e of events) {
    if (e.type === 'start') startT = e.t;
    if (e.type === 'observe') {
      Object.assign(at(e.step), {
        image: e.image, text: e.text, title: e.title, path: e.path, url: e.url, focus: e.focus || null, observedAt: e.t, observed: true,
        stage: e.stage ?? stageOfPage(external ? e.url || e.path : e.path),
      });
    } else if (e.type === 'thinking') {
      Object.assign(at(e.step), { thinking: true, thinkingAt: e.t });
    } else if (e.type === 'decide') {
      if (e.final) { closing = e; continue; }
      Object.assign(at(e.step), { action: e.action, args: e.args || {}, thought: e.thought, thinkMs: e.thinkMs ?? null, decidedAt: e.t, thinking: false });
    } else if (e.type === 'target') {
      at(e.step).target = { box: e.box || null, missing: !!e.missing, role: e.role, name: e.name, tag: e.tag, image: e.image };
    } else if (e.type === 'act') {
      const s = at(e.step);
      Object.assign(s, { result: e.result, ok: e.ok ?? !FAILED.test(e.result || ''), refused: !!e.refused || /^Not allowed/.test(e.result || ''), keys: e.keys ?? keysFor(s.action, s.args), actMs: e.actMs ?? ms(s.decidedAt, e.t), actedAt: e.t });
    }
  }
  const list = [...map.values()].filter((s) => s.observed || s.action).sort((a, b) => a.n - b.n);
  // Old runs have no "thinking" event: a step that was observed but not decided yet is being decided.
  for (const s of list) if (s.observed && !s.action) s.thinking = true;
  // "done"/"give_up" steps are decisions without an act; they count as a step but not as a failure.
  for (const s of list) if ((s.action === 'done' || s.action === 'give_up') && s.ok == null) s.ok = s.action === 'done';

  const end = events.find((e) => e.type === 'end');
  if (end) {
    const last = list.at(-1);
    let stage = end.stage ?? stageOfPage(external ? end.url || end.path : end.path);
    const o = run?.outcome?.status || end.outcome?.status;
    if (o === 'purchased' || o === 'wrong-item') stage = 4;
    if (o === 'reached-payment') stage = Math.max(stage, 3);
    const lastThought = last && (last.action === 'give_up' || last.action === 'done') ? last.thought : null;
    list.push({ n: 'end', final: true, lastThought, image: end.image, text: end.text, title: end.title, path: end.path, url: end.url, stage, outcome: run?.outcome || end.outcome, closing, ok: ['purchased', 'reached-payment'].includes(o), observedAt: end.t, prevStage: last?.stage ?? 0 });
  }

  // Cumulative counters, circling detection and the view (image + box) of each step.
  let keys = 0, deadEnds = 0, browserMs = 0, actions = 0;
  let lastFocus = null;
  list.forEach((s, i) => {
    if (s.result != null) {
      actions += 1;
      keys += s.keys || 0;
      if (!s.ok) deadEnds += 1;
      browserMs += s.actMs || 0;
    }
    s.counts = { step: s.final ? list.filter((x) => !x.final).length : i + 1, keys, deadEnds, browserSeconds: Math.round(browserMs / 100) / 10, actions };
    s.narration = narrate(s, run?.persona, { lastFocus, stageName: STAGES[s.stage ?? 0] });
    const f = String(s.result || '').match(/^Focus moved to: ([\s\S]*)$/);
    if (f) lastFocus = f[1];
    else if (s.text) { const k = s.text.match(/Keyboard focus: (.*)$/m); if (k) lastFocus = k[1]; }
    s.circling = circling(list, i);
    s.view = viewOf(list, i);
  });
  return { steps: list, startT };
}

// The customer keeps coming back to the same perceived screen (same page, same focus): 3 or more times
// in the last 10 steps. That is what a focus trap or a dead control looks like before the run gives up.
function circling(list, i) {
  const s = list[i];
  if (!s.action || s.final || !s.text) return null;
  const win = list.slice(Math.max(0, i - 9), i + 1).filter((x) => x.action && !x.final);
  const counts = new Map();
  for (const x of win) counts.set(x.text, (counts.get(x.text) || 0) + 1);
  const mine = counts.get(s.text) || 0;
  if (mine < 3) return null;
  const repeating = win.filter((x) => counts.get(x.text) >= 2);
  const labels = [...new Set(repeating.map((x) => ({ next: 'Tab', prev: 'Shift+Tab', activate: 'Enter', press: x.args?.key, read: 'Read page', type: 'typing', jump: 'jump', click: `click “${x.args?.name}”`, fill: `fill “${x.args?.name}”` }[x.action] || x.action)))];
  return { times: mine, window: win.length, labels };
}

// Which screenshot to show for a step and which box to ring on it.
// Tab and Shift+Tab: the screenshot after the key, ringed at the new focus (that is what the sentence says).
// Click, fill, Enter, keys: the step's own screenshot, ringed at the element acted on.
function viewOf(list, i) {
  const s = list[i];
  const next = list[i + 1];
  const failed = s.result != null && !s.ok;
  if (s.final) return { image: s.image, box: null, kind: 'end' };
  if ((s.action === 'next' || s.action === 'prev') && next?.image) {
    return { image: next.image, box: next.focus || null, kind: 'focus', failed, after: true };
  }
  if (s.target) {
    if (s.target.missing) return { image: s.image, box: null, kind: 'missing', missing: s.target, failed: true };
    if (s.target.box) return { image: s.target.image || s.image, box: s.target.box, kind: 'target', failed };
  }
  if (s.focus && s.action !== 'click' && s.action !== 'fill' && s.action !== 'select' && s.action !== 'check') return { image: s.image, box: s.focus, kind: 'focus', failed };
  return { image: s.image, box: null, kind: 'none', failed };
}

export function stageIndexOf(step) { return step?.stage ?? 0; }

// Alt text for a screenshot, built from the step.
export function altFor(step, run, personaLabel) {
  if (!step) return '';
  const page = step.title ? step.title.split(' - ')[0] : 'the page';
  const where = `${STAGES[step.stage ?? 0]} stage, ${page} page`;
  if (step.final) return `Final screen: ${where}.`;
  const box = step.view?.box ? ' The highlight ring marks the element in the sentence.' : '';
  return `Step ${step.n}, ${where}${step.view?.after ? ', after the key press' : ''}. ${personaLabel || 'The customer'}: ${step.narration?.text || ''}${box}`;
}
