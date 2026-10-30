import React, { useEffect, useRef, useState } from 'react';
import { STAGES, VIEWPORT } from './model.js';
import { actionLabel } from '../../../shared/narrate.js';

export function PersonaIcon({ persona }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false' };
  if (persona === 'screenreader') return <svg {...common}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></svg>;
  if (persona === 'keyboard') return <svg {...common}><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9" /></svg>;
  return <svg {...common}><rect x="5" y="7" width="14" height="11" rx="3" /><path d="M12 3v4M9 12h.01M15 12h.01M9.5 15.5h5" /></svg>;
}

// The checkout progress: five stages as an ordered list, the current one ringed like a focused Pay button.
export function StageRail({ step, run, compactLabel }) {
  const cur = step?.stage ?? 0;
  const final = step?.final;
  const o = run.outcome?.status;
  const paid = final && (o === 'purchased') && (!run.payment || run.payment.status === 'COMPLETED');
  const blocked = final && !['purchased', 'reached-payment'].includes(o);
  return (
    <ol className="rv-rail" aria-label="Checkout progress">
      {STAGES.map((name, i) => {
        let state = i < cur ? 'done' : i === cur ? 'current' : 'todo';
        if (i === cur && paid && i === 4) state = 'paid';
        if (i === cur && blocked) state = 'blocked';
        if (i === cur && final && o === 'reached-payment') state = 'stop';
        const note = state === 'paid' ? 'PayPal confirmed' : state === 'blocked' ? 'Blocked here' : state === 'stop' ? 'Stopped here' : state === 'current' ? (step && !final ? `step ${step.n}` : '') : '';
        const sr = state === 'done' ? ', done' : state === 'todo' ? ', not reached' : note ? `, ${note}` : '';
        return (
          <li key={name} className={`rv-rail-item ${state}`} aria-current={i === cur ? 'step' : undefined}>
            <span className="rv-rail-dot" aria-hidden="true">{state === 'done' || state === 'paid' ? '✓' : state === 'blocked' ? '✕' : i + 1}</span>
            <span className="rv-rail-name">{name}<span className="sr-only">{sr}</span></span>
            {note && <span className="rv-rail-note" aria-hidden="true">{note}</span>}
          </li>
        );
      })}
    </ol>
  );
}

// The screenshot with the moving focus ring. Boxes are in screenshot pixels; the ring uses percentages,
// so it follows the image at any displayed size.
export function Screen({ runId, step, alt, mode, speed }) {
  const [size, setSize] = useState(VIEWPORT);
  const view = step?.view || {};
  const box = view.box;
  const bad = view.failed || view.kind === 'missing' || step?.narration?.tone === 'bad';
  const ring = box ? {
    left: `${(box.x / size.width) * 100}%`, top: `${(box.y / size.height) * 100}%`,
    width: `${(Math.max(box.width, 8) / size.width) * 100}%`, height: `${(Math.max(box.height, 8) / size.height) * 100}%`,
  } : null;
  const badgeBelow = box && box.y < 34;
  const missing = view.missing;
  return (
    <figure className="rv-screen">
      <div className="rv-shot-wrap">
        {view.image
          ? <img key="shot" className="rv-shot" src={`/runs-data/${runId}/${view.image}`} alt={alt} width={size.width} height={size.height} onLoad={(e) => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; if (w && h && (w !== size.width || h !== size.height)) setSize({ width: w, height: h }); }} />
          : <div className="rv-shot rv-shot-empty" role="img" aria-label="No screenshot yet">Waiting for the first screen…</div>}
        <span className={`rv-ring${ring ? '' : ' hidden'}${bad ? ' bad' : ''}`} style={ring || undefined} aria-hidden="true">
          {step && !step.final && <span className={`rv-ring-badge${badgeBelow ? ' below' : ''}`}>{step.n} · {step.action ? actionLabel(step) : 'focus'}</span>}
        </span>
        {missing && (
          <p className="rv-missing"><span aria-hidden="true">✕ </span>No {missing.role === 'textbox' ? 'text box' : missing.role || 'element'} named “{missing.name}” on this page</p>
        )}
        <span className={`rv-mode ${mode}`}>{mode === 'live' ? 'Live' : mode === 'earlier' ? 'Earlier step' : `Replay${speed ? ` · ${speed}x` : ''}`}</span>
      </div>
    </figure>
  );
}

function fmtSecs(s) { return s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${s} s`; }

// "Now": the one sentence, the customer's own reasoning, what they heard or saw, and the counters.
export function NowCard({ step, prev, run, live, now, total }) {
  const n = step?.narration || { text: 'Opening the shop…', tone: 'idle' };
  const thinkingSince = live && step?.thinking && !step.action ? (step.thinkingAt || step.observedAt) : null;
  const secs = thinkingSince ? Math.max(0, Math.round((now - Date.parse(thinkingSince)) / 1000)) : 0;
  const c = step?.counts || { step: 0, keys: 0, deadEnds: 0, browserSeconds: 0, actions: 0 };
  const thought = step?.final ? step.closing?.thought || step.lastThought : step?.thought;
  const agent = run.persona === 'agent';
  return (
    <section className="rv-now card" aria-labelledby="rv-now-title">
      <h2 className="rv-now-kicker" id="rv-now-title">
        {live ? 'Now' : step?.final ? 'At the end' : `Step ${step?.n ?? ''}${total ? ` of ${total}` : ''}`}
      </h2>
      <p className={`rv-now-text tone-${n.tone}`}>
        {n.tone === 'bad' && <span className="rv-now-icon" aria-hidden="true">✕ </span>}
        {n.tone === 'refused' && <span className="rv-now-icon" aria-hidden="true">■ </span>}
        {n.text}
      </p>
      {thinkingSince && prev?.narration && (
        <p className="rv-now-line"><span className="rv-now-label">Last move</span> <span className={`rv-last tone-${prev.narration.tone}`}>{prev.narration.text}</span></p>
      )}
      {thinkingSince && (
        <p className="rv-thinking" role="timer" aria-live="off"><span className="rv-thinking-dot" aria-hidden="true" />Thinking for {secs} s<span className="rv-thinking-note"> The AI playing the customer is choosing the next move. This is not the customer's time.</span></p>
      )}
      {thought && (
        <p className="rv-now-line"><span className="rv-now-label">{step?.final ? 'Says' : 'Thinks'}</span> <i>“{thought}”</i></p>
      )}
      {n.perceived && (
        <p className="rv-now-line"><span className="rv-now-label">{n.perceived.label}</span> <span className="rv-heard">{n.perceived.text}</span></p>
      )}
      {step?.circling && (
        <p className="rv-circles" role="note"><span aria-hidden="true">↻ </span><strong>Going in circles.</strong> Back on the same screen {step.circling.times} times in the last {step.circling.window} steps, trying {step.circling.labels.join(', ')}.</p>
      )}
      <dl className="rv-counters">
        <div><dt>Step</dt><dd>{c.step}</dd></div>
        <div><dt>{agent ? 'Actions' : 'Keys pressed'}</dt><dd>{agent ? c.actions : c.keys}</dd></div>
        <div className={c.deadEnds ? 'alert' : ''}><dt>Dead ends</dt><dd>{c.deadEnds}</dd></div>
        <div><dt>Browser time</dt><dd>{c.browserSeconds} s</dd></div>
      </dl>
      {!live && step?.thinkMs ? <p className="rv-foot">The AI took {fmtSecs(Math.round(step.thinkMs / 1000))} to choose this move. Browser time is what the page itself took.</p> : null}
    </section>
  );
}

// Thumbnails grouped by checkout stage. One tab stop; arrow keys move between steps.
export function Filmstrip({ runId, steps, current, onPick }) {
  const ref = useRef(null);
  const groups = [];
  for (const s of steps) {
    const g = groups.at(-1);
    if (g && g.stage === s.stage) g.items.push(s); else groups.push({ stage: s.stage, items: [s] });
  }
  useEffect(() => {
    const el = ref.current?.querySelector('[aria-current="step"]');
    // Keyboard users moving through the strip keep focus on the current step.
    if (el && ref.current?.contains(document.activeElement) && document.activeElement !== el) el.focus({ preventScroll: true });
    if (el && ref.current) {
      const strip = ref.current;
      const l = el.offsetLeft - strip.offsetLeft;
      if (l < strip.scrollLeft || l + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = Math.max(0, l - strip.clientWidth / 2);
    }
  }, [current?.n]);
  return (
    <div className="rv-strip" ref={ref} role="group" aria-label="Steps, grouped by checkout stage. Use the arrow keys to move between steps.">
      {groups.map((g, gi) => (
        <div className="rv-strip-group" key={gi}>
          <p className="rv-strip-stage" aria-hidden="true">{STAGES[g.stage]}</p>
          <ol className="rv-strip-list">
            {g.items.map((s) => {
              const isCur = current?.n === s.n;
              const state = s.final ? (s.ok ? 'ok' : 'bad') : s.result == null && s.action !== 'give_up' && s.action !== 'done' ? 'pending' : s.ok ? 'ok' : 'bad';
              const label = `${s.final ? 'End' : `Step ${s.n}`}, ${STAGES[s.stage]}: ${s.narration?.text || ''}${state === 'bad' ? ' Failed.' : ''}`;
              return (
                <li key={s.n}>
                  <button type="button" className={`rv-thumb ${state}`} aria-current={isCur ? 'step' : undefined} tabIndex={isCur ? 0 : -1} aria-label={label} onClick={() => onPick(s.n)} data-n={s.n}>
                    {s.image ? <img src={`/runs-data/${runId}/${s.image}`} alt="" loading="lazy" width="80" height="54" /> : <span className="rv-thumb-blank" />}
                    <span className="rv-thumb-n" aria-hidden="true">{s.final ? 'end' : s.n}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

// One polite live region for the narration, at most one message every 2 seconds (the latest wins).
export function useAnnouncer(message, enabled) {
  const [said, setSaid] = useState('');
  const last = useRef(0);
  const timer = useRef(null);
  const pending = useRef('');
  const first = useRef(true);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!enabled || !message) return;
    pending.current = message;
    if (timer.current) return;
    timer.current = setTimeout(() => { timer.current = null; last.current = Date.now(); setSaid(pending.current); }, Math.max(0, last.current + 2000 - Date.now()));
  }, [message, enabled]);
  useEffect(() => { if (!enabled) { clearTimeout(timer.current); timer.current = null; setSaid(''); } }, [enabled]);
  return said;
}
