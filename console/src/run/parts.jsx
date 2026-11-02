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
  // Between the customer's last step and the end of the run the server still asks PayPal about the order and
  // scans the pages: a claimed purchase is "checking" until then, never "blocked".
  const checking = final && run.status === 'running' && (step.outcome?.status === 'purchased' || !step.outcome);
  const o = checking ? null : run.outcome?.status || step?.outcome?.status;
  const paid = final && (o === 'purchased') && (!run.payment || run.payment.status === 'COMPLETED');
  const blocked = final && !checking && !['purchased', 'reached-payment'].includes(o);
  return (
    <ol className="rv-rail" aria-label="Checkout progress">
      {STAGES.map((name, i) => {
        let state = i < cur ? 'done' : i === cur ? 'current' : 'todo';
        if (i === cur && paid && i === 4) state = 'paid';
        if (i === cur && blocked) state = 'blocked';
        if (i === cur && final && o === 'reached-payment') state = 'stop';
        if (i === cur && checking) state = 'checking';
        const note = state === 'paid' ? 'PayPal confirmed' : state === 'blocked' ? 'Blocked here' : state === 'stop' ? 'Stopped here' : state === 'checking' ? 'Checking with PayPal' : state === 'current' ? (step && !final ? `step ${step.n}` : '') : '';
        const sr = state === 'done' ? ', done' : state === 'todo' ? ', not reached' : note ? `, ${note}` : '';
        return (
          <li key={name} className={`rv-rail-item ${state}`} aria-current={i === cur ? 'step' : undefined}>
            <span className="rv-rail-dot" aria-hidden="true">{state === 'done' || state === 'paid' ? '✓' : state === 'blocked' ? '✕' : state === 'checking' ? '' : i + 1}</span>
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
export function Screen({ runId, step, alt, mode, speed, zoomable, noShots }) {
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
      <div className="rv-screen-bar"><span className={`rv-mode ${mode}`}>{mode === 'live' ? 'Live' : mode === 'earlier' ? 'Earlier step' : `Replay${speed ? ` · ${speed}x` : ''}`}</span></div>
      <div className="rv-shot-wrap">
        {view.image
          ? (() => {
            const src = `/runs-data/${runId}/${view.image}`;
            const img = <img key="shot" className="rv-shot" src={src} alt={alt} width={size.width} height={size.height} onLoad={(e) => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; if (w && h && (w !== size.width || h !== size.height)) setSize({ width: w, height: h }); }} />;
            // On a phone the screenshot is small: a tap opens it full size.
            return zoomable ? <a className="rv-shot-zoom" href={src} target="_blank" rel="noreferrer">{img}<span className="sr-only"> (open full size in a new tab)</span></a> : img;
          })()
          : <div className="rv-shot rv-shot-empty" role="img" aria-label={noShots || 'No screenshot yet'}>{noShots || 'Waiting for the first screen…'}</div>}
        <span className={`rv-ring${ring ? '' : ' hidden'}${bad ? ' bad' : ''}`} style={ring || undefined} aria-hidden="true">
          {step && !step.final && !step.closingMove && <span className={`rv-ring-badge${badgeBelow ? ' below' : ''}`}>{step.n} · {step.action ? actionLabel(step) : 'focus'}</span>}
        </span>
        {missing && (
          <p className="rv-missing"><span aria-hidden="true">✕ </span>No {missing.role === 'textbox' ? 'text box' : missing.role || 'element'} named “{missing.name}” on this page</p>
        )}
      </div>
    </figure>
  );
}

// "1:49 min" or "42 s", the same format as the analytics page.
function Est({ s }) {
  const v = Math.round(s);
  return v < 60 ? <>{v}<small> s</small></> : <>{Math.floor(v / 60)}:{String(v % 60).padStart(2, '0')}<small> min</small></>;
}

// "Now": the one sentence, the customer's own reasoning, what they heard or saw, and the counters.
export function NowCard({ step, prev, run, live, now, total, hideQuote, finalEst, partialEst = true }) {
  const n = step?.narration || { text: 'Opening the shop…', tone: 'idle' };
  const thinkingSince = live && step?.thinking && !step.action ? (step.thinkingAt || step.observedAt) : null;
  const secs = thinkingSince ? Math.max(0, Math.round((now - Date.parse(thinkingSince)) / 1000)) : 0;
  const c = step?.counts || { step: 0, keys: 0, deadEnds: 0, browserSeconds: 0, actions: 0 };
  // The customer's closing words are shown once, in the outcome card below (hideQuote).
  const thought = step?.final ? (hideQuote ? null : step.closing?.thought || step.lastThought) : step?.thought;
  const agent = run.persona === 'agent';
  return (
    <section className="rv-now card" aria-labelledby="rv-now-title">
      <h2 className="rv-now-kicker" id="rv-now-title">
        {live ? 'Now' : step?.final ? 'At the end' : step?.closingMove ? 'Last decision' : `Step ${step?.counts?.step ?? step?.n ?? ''}${total ? ` of ${total}` : ''}`}
      </h2>
      <p className={`rv-now-text tone-${step?.final && run.outcome?.status === 'reached-payment' ? 'neutral' : n.tone}`}>
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
        <div><dt>Steps</dt><dd>{c.step}</dd></div>
        <div><dt>Keys</dt><dd>{agent ? <span title="The AI agent acts on elements, not keys">—</span> : c.keys}</dd></div>
        <div className={c.deadEnds ? 'alert' : ''}><dt>Failed</dt><dd>{c.deadEnds}</dd></div>
        <div><dt>Est. time for a person</dt><dd>{(() => {
          // At the end: the run's own figure from the server. On a step: the running total, when the record allows it.
          const est = agent ? null : step?.final && finalEst != null ? finalEst : partialEst ? c.klmSeconds : null;
          return est == null ? '—' : <Est s={est} />;
        })()}</dd></div>
      </dl>
      <p className="rv-foot">Failed: actions on a control that was missing or could not be used. Est. time: what this path would take a person, from the steps and keys (keystroke-level model){agent ? '; none for the AI agent, which presses no keys' : ''}. Not measured time.</p>
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
              const label = `${s.final ? 'End' : s.closingMove ? 'Last decision' : `Step ${s.n}`}, ${STAGES[s.stage]}: ${s.narration?.text || ''}${state === 'bad' ? ' Failed.' : ''}`;
              return (
                <li key={s.n}>
                  <button type="button" className={`rv-thumb ${state}`} aria-current={isCur ? 'step' : undefined} tabIndex={isCur ? 0 : -1} aria-label={label} onClick={() => onPick(s.n)} data-n={s.n}>
                    {s.image ? <img src={`/runs-data/${runId}/${s.image}`} alt="" loading="lazy" width="80" height="54" /> : <span className="rv-thumb-blank" />}
                    <span className="rv-thumb-n" aria-hidden="true">{s.final ? 'end' : s.closingMove ? (s.action === 'done' ? 'done' : 'stop') : s.n}</span>
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
