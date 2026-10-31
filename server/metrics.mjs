// Per-run effort and friction metrics, computed from the recorded events only. Works on old runs too:
// fields recorded later (keys, ok, stage, thinkMs, actMs) are derived when they are missing.

import crypto from 'node:crypto';
import { STAGES, stageOfPage } from '../shared/stages.js';

const FAILED = /did not work|There is no|cannot take keyboard focus|not available|Nothing was typed|Not allowed/;

// Keystroke-level model constants (Card, Moran and Newell, The Psychology of Human-Computer Interaction, 1983):
// K = 0.28 s per keystroke for an average typist, M = 1.35 s per mental preparation. Listening at 180 words a minute.
export const KLM = { keystroke: 0.28, mental: 1.35, wordsPerMinute: 180 };

function keysFor(d) {
  const a = d.args || {};
  if (['next', 'prev', 'activate', 'press'].includes(d.action)) return 1;
  if (d.action === 'type') return String(a.text ?? '').length + 1;
  if (d.action === 'jump') return 2;
  return 0;
}

const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);
const words = (s) => (String(s).match(/[A-Za-z0-9$£€]+/g) || []).length;

export function runMetrics(run) {
  // A withheld shop's run keeps the metrics measured before its page text was removed.
  if (run.metricsKept) return run.metricsKept;
  const ev = run.events || [];
  const decides = ev.filter((e) => e.type === 'decide' && !e.final && e.action !== 'done' && e.action !== 'give_up');
  const acts = ev.filter((e) => e.type === 'act');
  const observes = ev.filter((e) => e.type === 'observe');
  const byStep = new Map(decides.map((d) => [d.step, d]));
  const external = !!run.site;

  let keys = 0, tabs = 0, deadEnds = 0, refused = 0, noEffect = 0, wordsHeard = 0, browserMs = 0, thinkMs = 0;
  for (const a of acts) {
    const d = byStep.get(a.step) || {};
    keys += a.keys ?? keysFor(d);
    if (d.action === 'next' || d.action === 'prev') tabs += 1;
    const ok = a.ok ?? !FAILED.test(a.result || '');
    if (!ok) deadEnds += 1;
    if (a.refused) refused += 1;
    if (a.actMs) browserMs += a.actMs;
    const heard = String(a.result || '').match(/^Focus moved to: (.*)$/s);
    if (heard && run.persona === 'screenreader') wordsHeard += words(heard[1]);
  }
  // Older runs have no thinkMs: derive it from the observe and decide timestamps of the same step.
  for (const d of decides) {
    if (d.thinkMs) { thinkMs += d.thinkMs; continue; }
    const o = observes.find((x) => x.step === d.step);
    if (o && d.t && o.t) thinkMs += Math.max(0, Date.parse(d.t) - Date.parse(o.t));
  }
  if (run.persona === 'screenreader') for (const d of decides) if (d.action === 'read') {
    const o = observes.find((x) => x.step === d.step);
    if (o) wordsHeard += words(o.text);
  }

  // States: an action "changed nothing" when the page the customer perceives is identical before and after.
  const states = observes.map((o) => hash(o.text));
  for (let i = 1; i < states.length; i++) if (states[i] === states[i - 1]) noEffect += 1;
  const counts = new Map();
  for (const s of states) counts.set(s, (counts.get(s) || 0) + 1);
  const mostRepeated = Math.max(0, ...counts.values());

  // Longest stretch of steps that never reached a new state (a stall).
  let stall = 0, cur = 0;
  const seen = new Set();
  for (const s of states) {
    if (seen.has(s)) { cur += 1; stall = Math.max(stall, cur); } else { cur = 0; seen.add(s); }
  }

  const stageOf = (o) => (o.stage ?? stageOfPage(external ? o.url || o.path : o.path));
  const success = ['purchased', 'reached-payment'].includes(run.outcome?.status);
  let furthest = Math.max(0, ...observes.map(stageOf));
  if (run.outcome?.status === 'purchased' || run.outcome?.status === 'wrong-item') furthest = 4;
  if (run.outcome?.status === 'reached-payment') furthest = Math.max(furthest, 3);

  const stepsPerStage = STAGES.map(() => 0);
  for (const o of observes) stepsPerStage[stageOf(o)] += 1;

  const steps = decides.length;
  // A time estimate only makes sense for people; AI agents have no keystroke time.
  const klmSeconds = run.persona === 'agent' ? null : Math.round(keys * KLM.keystroke + steps * KLM.mental + (wordsHeard / KLM.wordsPerMinute) * 60);

  return {
    outcome: run.outcome?.status || null,
    success,
    furthestStage: STAGES[furthest],
    steps,
    keys,
    tabs,
    tabShare: steps ? Math.round((tabs / steps) * 100) : 0,
    deadEnds,
    refused,
    noEffect,
    distinctStates: counts.size,
    mostRepeatedState: mostRepeated,
    longestStall: stall,
    wordsHeard,
    browserSeconds: Math.round(browserMs / 100) / 10,
    aiThinkSeconds: Math.round(thinkMs / 1000),
    klmSeconds,
    stepsPerStage: Object.fromEntries(STAGES.map((s, i) => [s, stepsPerStage[i]])),
    scanner: run.scan?.totalViolations ?? null,
  };
}

// Compares two runs of the same customer. "Easier" is only claimed when both reached the same outcome.
export function compareRuns(before, after) {
  const a = runMetrics(before);
  const b = runMetrics(after);
  if (a.success !== b.success) {
    return { kind: a.success ? 'regressed' : 'unblocked', label: a.success ? 'possible → impossible' : 'impossible → possible', before: a, after: b };
  }
  const delta = (k) => b[k] - a[k];
  return { kind: 'effort', label: 'same outcome, effort compared', before: a, after: b, delta: { steps: delta('steps'), keys: delta('keys'), deadEnds: delta('deadEnds'), klmSeconds: delta('klmSeconds') } };
}
