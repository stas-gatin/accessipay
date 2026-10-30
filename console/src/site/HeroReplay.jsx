import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { RUNS, ORDERS, PAY_FIX } from './facts.js';
import { useInView, usePageVisible, useReducedMotion } from './motion.jsx';

// M1: replay of the real run pair. Run c2dca6 (AI agent blocked: the Pay button is a <div>),
// then run 2514af (after the AI fix, PayPal sandbox order COMPLETED).
// Frames, paths and the agent's own words come from GET /api/runs/:id. The runs do not record
// element boxes yet, so ring positions are measured once from the 1280 x 860 screenshots.
const W = 1280;
const H = 860;
const STAGES = ['Browse', 'Cart', 'Details', 'Payment', 'PayPal confirmed'];

const SCRIPT = [
  { run: 'blocked', step: 1, box: [233, 293, 138, 44], stage: 0, ms: 1400 },
  { run: 'blocked', step: 3, box: [807, 283, 31, 44], stage: 1, ms: 1400 },
  { run: 'blocked', step: 5, box: [233, 209, 420, 42], stage: 2, ms: 1400, line: 'Fills in name, email, address and delivery (steps 5 to 12).' },
  { run: 'blocked', step: 13, box: [216, 695, 181, 44], stage: 2, ms: 1300 },
  { run: 'blocked', step: 18, box: [233, 735, 112, 44], stage: 3, ms: 1800, line: 'Card filled. Looks for a button named “Pay”. The page shows one.' },
  { run: 'blocked', step: 20, box: [233, 735, 112, 44], stage: 3, ms: 2700, mode: 'blocked' },
  { run: 'blocked', step: 20, box: [233, 735, 112, 44], stage: 3, ms: 2900, mode: 'fix', line: 'AI reads the page where the agent stopped and writes one change.' },
  { run: 'fixed', step: 14, box: [233, 437, 420, 42], stage: 3, ms: 1200, line: 'After the fix: same agent, same task, same shop.' },
  { run: 'fixed', step: 18, box: [233, 735, 112, 44], stage: 3, ms: 1700 },
  { run: 'fixed', step: 'done', box: null, stage: 4, ms: 3800, mode: 'paid', line: 'PayPal confirms the order.' },
];

function describe(d) {
  if (!d) return '';
  const a = d.args || {};
  switch (d.action) {
    case 'click': return `Clicks ${a.role || 'element'} “${a.name}”.`;
    case 'fill': return `Types into “${a.name}”.`;
    case 'select': return `Chooses “${a.option}” in “${a.name}”.`;
    case 'check': return `Checks “${a.name}”.`;
    case 'press': return `Presses ${a.key}.`;
    case 'read': return 'Reads the page again.';
    case 'give_up': return 'Gives up.';
    default: return '';
  }
}

function indexRun(run) {
  const frames = {};
  for (const e of run?.events || []) {
    if (e.type === 'observe') frames[e.step] = { ...(frames[e.step] || {}), image: e.image, path: e.path };
    if (e.type === 'decide') frames[e.step] = { ...(frames[e.step] || {}), decide: e };
  }
  return frames;
}

const pad = (n) => `step-${String(n).padStart(3, '0')}.jpg`;

export default function HeroReplay() {
  const [runs, setRuns] = useState({ blocked: null, fixed: null });
  useEffect(() => {
    let live = true;
    Promise.all([api(`/api/runs/${RUNS.agentBlocked}`), api(`/api/runs/${RUNS.agentFixed}`)])
      .then(([blocked, fixed]) => { if (live) setRuns({ blocked, fixed }); })
      .catch(() => { /* frames fall back to the recorded file names */ });
    return () => { live = false; };
  }, []);

  const frames = useMemo(() => {
    const idx = { blocked: indexRun(runs.blocked), fixed: indexRun(runs.fixed) };
    const id = { blocked: RUNS.agentBlocked, fixed: RUNS.agentFixed };
    return SCRIPT.map((f) => {
      if (f.step === 'done') return { ...f, src: '/img/shop-done-sandbox.jpg', path: '/done', runId: id[f.run] };
      const rec = idx[f.run][f.step] || {};
      let line = f.line || describe(rec.decide);
      if (f.mode === 'blocked') line = rec.decide?.thought ? `“${rec.decide.thought}”` : '“No pay button exists in the tree, so I cannot place the order.”';
      return { ...f, src: `/runs-data/${id[f.run]}/${rec.image || pad(f.step)}`, path: rec.path || '', line, runId: id[f.run] };
    });
  }, [runs]);

  const blockedSteps = runs.blocked?.steps ?? 22;
  const fixedSteps = runs.fixed?.steps ?? ORDERS.agentFixed.steps;
  const pay = runs.fixed?.payment || { amount: ORDERS.agentFixed.amount, status: 'COMPLETED' };
  const blockedViolations = runs.blocked?.scan?.totalViolations ?? 0;

  const reduced = useReducedMotion();
  const rootRef = useRef(null);
  const inView = useInView(rootRef, { threshold: 0.25, once: false });
  const pageVisible = usePageVisible();
  const [i, setI] = useState(0);
  const [userPaused, setUserPaused] = useState(null); // null = not chosen yet
  const paused = userPaused ?? reduced;
  const playing = !paused && inView && pageVisible;

  useEffect(() => {
    if (!playing) return undefined;
    const t = setTimeout(() => setI((n) => (n + 1) % frames.length), frames[i].ms);
    return () => clearTimeout(t);
  }, [playing, i, frames]);

  const f = frames[i];
  const box = f.box;
  const ringStyle = box ? {
    left: `${(box[0] / W) * 100}%`, top: `${(box[1] / H) * 100}%`, width: `${(box[2] / W) * 100}%`, height: `${(box[3] / H) * 100}%`,
  } : null;
  const stepLabel = f.step === 'done' ? `Paid in ${fixedSteps} steps` : `Step ${f.step}`;
  const runLabel = f.run === 'blocked' ? 'Before the fix' : 'After the fix';
  const go = (d) => { setUserPaused(true); setI((n) => (n + d + frames.length) % frames.length); };

  return (
    <div className="rp" ref={rootRef}>
      <p className="sr-only">
        Replay of two recorded runs. An AI shopping agent fills in the demo shop’s checkout but finds no Pay button,
        because the button is a div. It gives up after {blockedSteps} steps while axe-core reports {blockedViolations} violations.
        After the AI fix the same agent pays in {fixedSteps} steps and PayPal confirms the payment.
      </p>
      <div className="rp-card" aria-hidden="true">
        <div className="rp-head">
          <span className={`rp-chip ${f.run}`}><i />{runLabel}</span>
          <span className="rp-who">AI shopping agent</span>
          <span className="rp-step tnum">{stepLabel}</span>
        </div>
        <div className="rp-browser">
          <div className="rp-bar"><i /><i /><i /><span>pine-and-peak.demo{f.path === '/' ? '' : f.path}</span></div>
          <div className="rp-screen">
            {frames.map((fr, k) => (
              <img key={k} src={fr.src} alt="" className={k === i ? 'on' : ''} loading={k < 2 ? 'eager' : 'lazy'} decoding="async"
                style={fr.step === 'done' ? { objectFit: 'cover', objectPosition: 'top left' } : undefined} />
            ))}
            {ringStyle && (
              <span className={`rp-ring ${f.mode === 'blocked' || f.mode === 'fix' ? 'bad' : ''}`} style={ringStyle}>
                <b>{f.step}</b>
              </span>
            )}
            <div className={`rp-blocked ${f.mode === 'blocked' ? 'show' : ''}`}>
              <strong>Blocked at payment</strong>
              <span>{blockedSteps} steps · axe-core: {blockedViolations} violations</span>
              <span>The Pay button is a &lt;div&gt;. It is not in the accessibility tree.</span>
            </div>
            <div className={`rp-fix ${f.mode === 'fix' ? 'show' : ''}`}>
              <div className="rp-fix-head"><span>AI fix</span><span>1 change · pay page</span></div>
              <pre><span className="del">- {PAY_FIX.before}</span>{'\n'}<span className="add">+ {PAY_FIX.after}</span></pre>
            </div>
            <div className={`rp-paid ${f.mode === 'paid' ? 'show' : ''}`}>
              <div className="rp-paid-head"><span>PayPal Orders v2 · sandbox</span></div>
              <dl>
                <div><dt>Amount</dt><dd className="mono">${Number(pay.amount).toFixed(2)}</dd></div>
                <div><dt>Status</dt><dd><span className="rp-status">{pay.status}</span></dd></div>
              </dl>
              <p>Paid in {fixedSteps} steps after the AI fix.</p>
            </div>
          </div>
        </div>
        <ol className="rp-rail">
          {STAGES.map((s, k) => (
            <li key={s} className={`${k < f.stage ? 'done' : ''} ${k === f.stage ? 'now' : ''} ${k === f.stage && (f.mode === 'blocked' || f.mode === 'fix') ? 'bad' : ''} ${k === 4 && f.mode === 'paid' ? 'paid' : ''}`}>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className={`rp-stage-m ${f.mode === 'blocked' || f.mode === 'fix' ? 'bad' : ''} ${f.mode === 'paid' ? 'paid' : ''}`}>{STAGES[f.stage]}</p>
        <p className="rp-line" key={i}>{f.line}</p>
        <div className="rp-progress"><span key={`${i}-${playing}`} className={playing ? 'run' : ''} style={{ animationDuration: `${f.ms}ms` }} /></div>
      </div>
      <div className="rp-ctrl">
        <button type="button" className="rp-btn" onClick={() => go(-1)} aria-label="Previous frame">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5" /></svg>
        </button>
        <button type="button" className="rp-btn rp-play" onClick={() => setUserPaused(!paused)}>
          {paused
            ? <><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4.5v11l9-5.5z" className="fill" /></svg>Play replay</>
            : <><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4.5v11M13 4.5v11" /></svg>Pause replay</>}
        </button>
        <button type="button" className="rp-btn" onClick={() => go(1)} aria-label="Next frame">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5L13 10l-5.5 5.5" /></svg>
        </button>
        <span className="rp-count tnum" aria-hidden="true">{i + 1} / {frames.length}</span>
        <a className="rp-open" href={`#/runs/${f.runId}`}>Open this run<span className="sr-only"> ({runLabel.toLowerCase()})</span> →</a>
      </div>
    </div>
  );
}
