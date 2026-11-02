import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { buildSteps, altFor, STAGES } from './model.js';
import { PersonaIcon, StageRail, Screen } from './parts.jsx';
import './run.css';

// A test started from "Run a test" streams here, on the same page: the checkout stage, a small live view of the
// customer's screen, what it is doing now and its last moves. The full step-by-step analysis is one click away.
export default function LivePanel({ id, meta, onAgain }) {
  const [run, setRun] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const box = useRef(null);

  useEffect(() => {
    let es;
    api(`/api/runs/${id}`).then((r) => {
      setRun(r);
      setEvents(r.events || []);
      if (r.status !== 'running') return;
      es = new EventSource(`/api/runs/${id}/events`);
      const seen = (r.events || []).length;
      let i = 0;
      es.onmessage = (m) => {
        i += 1;
        if (i <= seen) return;
        const e = JSON.parse(m.data);
        setEvents((prev) => [...prev, e]);
        if (e.type === 'finished') { es.close(); api(`/api/runs/${id}`).then(setRun).catch(() => {}); }
      };
    }).catch((e) => setError(e.message));
    return () => es?.close();
  }, [id]);

  const running = !run || run.status === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => { box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); box.current?.focus({ preventScroll: true }); }, []);

  const { steps } = useMemo(() => buildSteps(events, run), [events, run]);
  if (error) return <p role="alert" className="pill bad">{error}</p>;

  const persona = meta.personas[run?.persona] || {};
  const current = steps.at(-1);
  const done = !running;
  const o = run?.outcome?.status;
  const paid = done && o === 'purchased' && run.payment?.status === 'COMPLETED';
  // After the customer's last step the server asks PayPal about the order and scans the pages; the clock stops at the last step.
  const endEv = events.find((e) => e.type === 'end');
  const oracleEv = events.find((e) => e.type === 'oracle');
  const scanEv = events.find((e) => e.type === 'scan');
  const wrapping = !done && !!endEv;
  const claimed = endEv?.outcome?.status === 'purchased';
  const endT = endEv?.t;
  const elapsed = run?.createdAt ? Math.max(0, Math.round(((endT ? Date.parse(endT) : now) - Date.parse(run.createdAt)) / 1000)) : 0;
  const thinkingSince = !done && current?.thinking && !current.action ? (current.thinkingAt || current.observedAt) : null;
  const thinkSecs = thinkingSince ? Math.max(0, Math.round((now - Date.parse(thinkingSince)) / 1000)) : 0;
  const moves = steps.filter((s) => !s.final && s.result != null).slice(-4).reverse();
  const c = current?.counts || { step: 0, deadEnds: 0 };
  const said = done ? null : current?.narration?.text || 'Opening the shop…';
  const where = run ? (run.defects?.length ? run.defects.map((d) => meta.defects.find((x) => x.id === d)?.short || d).join(', ') : 'Clean demo shop') : '';

  return (
    <section className={`lp card${done ? (paid ? ' lp-paid' : ' lp-blocked') : ''}`} ref={box} tabIndex={-1} aria-labelledby="lp-title">
      <div className="lp-head">
        <span className="rv-avatar"><PersonaIcon persona={run?.persona} /></span>
        <div className="lp-who">
          <h2 id="lp-title">{persona.label || 'Customer'}</h2>
          <p>{where}</p>
        </div>
        <span className={`rv-chip ${done ? (paid ? 'ok' : 'bad') : wrapping ? 'ok' : 'live'}`}>{!done && !wrapping && <span className="rv-live-dot" aria-hidden="true" />}{done ? (paid ? 'Paid' : o === 'reached-payment' ? 'Reached payment' : 'Could not buy') : wrapping ? 'Checking' : 'Live'}</span>
        <span className="lp-timer" role="timer" aria-live="off">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
      </div>

      {run && <StageRail step={current} run={run} />}

      <div className="lp-body">
        <div className="lp-window">
          <div className="lp-window-bar" aria-hidden="true"><span /><span /><span /><em>{current?.path || '/'}</em></div>
          {run && <Screen runId={id} step={current} alt={current ? altFor(current, run, persona.label) : ''} mode={done ? 'replay' : 'live'} />}
        </div>

        <div className="lp-side">
          {done ? (
            <div className="lp-result" role="status">
              <span className="lp-result-mark" aria-hidden="true">{paid ? '✓' : '✕'}</span>
              <div>
                <p className="lp-result-title">{paid ? 'Paid. PayPal confirmed the order.' : o === 'reached-payment' ? 'Reached the payment step.' : `Could not buy. Stopped at the ${STAGES[current?.stage ?? 0]} step.`}</p>
                <p className="lp-result-note">{paid ? `PayPal sandbox status COMPLETED, order ${run.payment.orderId}. ` : ''}{c.step} steps, {c.deadEnds} failed, {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} min.</p>
              </div>
            </div>
          ) : wrapping ? (
            <div className="lp-check" role="status">
              <p className="lp-kicker">{claimed ? 'The order page says it is paid' : 'The customer stopped'}</p>
              <p className="lp-said">{claimed ? 'Checking with PayPal before calling it a pass…' : 'Finishing the run…'}</p>
              <ul>
                {claimed && <li className={oracleEv ? 'done' : 'now'}><span aria-hidden="true" />{oracleEv ? `PayPal: ${oracleEv.payment?.status || 'answered'}` : 'Asking PayPal for the order (Orders v2)'}</li>}
                <li className={scanEv ? 'done' : 'now'}><span aria-hidden="true" />{scanEv ? `axe-core: ${scanEv.totalViolations} violation${scanEv.totalViolations === 1 ? '' : 's'} on the same pages` : 'Scanning the same pages with axe-core'}</li>
              </ul>
            </div>
          ) : (
            <div className="lp-now" aria-live="polite">
              <p className="lp-kicker">Now</p>
              <p key={said} className={`lp-said tone-${current?.narration?.tone || 'idle'}`}>{said}</p>
              {thinkingSince && <p className="lp-thinking"><span className="rv-thinking-dot" aria-hidden="true" />Thinking for {thinkSecs} s</p>}
            </div>
          )}

          <ol className="lp-moves" aria-label="Last moves">
            {moves.map((s) => (
              <li key={s.n} className={s.ok ? 'ok' : 'bad'}><b>{s.counts?.step}</b><span>{s.narration?.text}</span></li>
            ))}
          </ol>

          <dl className="lp-counts">
            <div><dt>Steps</dt><dd>{c.step}</dd></div>
            <div className={c.deadEnds ? 'alert' : ''}><dt>Failed</dt><dd>{c.deadEnds}</dd></div>
          </dl>

          <p className="lp-actions">
            <a className={`btn${done ? ' primary' : ''}`} href={`#/runs/${id}`}>{done ? (paid ? 'See the full analysis' : 'Open the run and fix it with AI') : 'Watch step by step'}</a>
            {done && <button type="button" className="btn" onClick={onAgain}>Start another test</button>}
          </p>
        </div>
      </div>
    </section>
  );
}
