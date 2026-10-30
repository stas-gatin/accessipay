import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, OUTCOME, shortDate } from './api.js';
import { buildSteps, altFor, STAGES } from './run/model.js';
import { PersonaIcon, StageRail, Screen, NowCard, Filmstrip, useAnnouncer } from './run/parts.jsx';
import FixPanel from './run/FixPanel.jsx';
import './run/run.css';

const SPEEDS = [1, 2, 4];
const STEP_MS = 1800;
const PREF = 'accessipay-announce';

function readPref() { try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; } }
function writePref(on) { try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* not remembered */ } }

const CHIP = {
  running: { label: 'Live', tone: 'live' },
  purchased: { label: 'Paid', tone: 'ok' },
  'reached-payment': { label: 'Reached payment', tone: 'ok' },
  blocked: { label: 'Blocked', tone: 'bad' },
  'wrong-item': { label: 'Wrong item', tone: 'warn' },
  stopped: { label: 'Stopped', tone: 'muted' },
  error: { label: 'Error', tone: 'bad' },
};

function useReducedMotion() {
  const [r, setR] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setR(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return r;
}

function OutcomeBanner({ run, steps, metrics }) {
  const o = run.outcome?.status;
  if (!o || run.status === 'running') return null;
  const last = steps.filter((s) => !s.final).at(-1);
  const stage = STAGES[steps.at(-1)?.prevStage ?? last?.stage ?? 0];
  const n = metrics?.steps ?? steps.filter((s) => !s.final).length;
  const effort = metrics && (
    <p className="rv-banner-effort">
      {n} steps · {run.persona === 'agent' ? `${metrics.steps} actions` : `${metrics.keys} keys pressed (${metrics.tabs} Tab)`} · {metrics.deadEnds} dead end{metrics.deadEnds === 1 ? '' : 's'} · {metrics.noEffect} move{metrics.noEffect === 1 ? '' : 's'} that changed nothing
      {metrics.klmSeconds != null && <> · about {metrics.klmSeconds} s for a person (keystroke-level model estimate)</>}
    </p>
  );
  if (o === 'purchased') {
    const p = run.payment;
    return (
      <section className="rv-banner ok" role="status" aria-label="Outcome">
        <p className="rv-banner-title"><span aria-hidden="true">✓ </span>Paid in {n} steps.{p ? ` PayPal ${p.mode === 'mock' ? 'mock' : 'sandbox'} order ${p.orderId} ${p.status}${p.amount != null ? `, $${Number(p.amount).toFixed(2)}` : ''}.` : ''}</p>
        {p && p.mode !== 'mock' && <p className="rv-banner-sub">Verified with PayPal Orders v2: the test counts only because PayPal confirms the order.</p>}
        {effort}
      </section>
    );
  }
  if (o === 'reached-payment') {
    return (
      <section className="rv-banner ok" role="status" aria-label="Outcome">
        <p className="rv-banner-title"><span aria-hidden="true">✓ </span>Reached the payment step of {run.site?.host || 'the shop'} in {n} steps.</p>
        <p className="rv-banner-sub">Stopped there on purpose: AccessiPay never pays, signs in or types card data on a real site.</p>
        {effort}
      </section>
    );
  }
  const scan = run.scan?.totalViolations;
  return (
    <section className={`rv-banner ${o === 'wrong-item' ? 'warn' : 'bad'}`} role="status" aria-label="Outcome">
      <p className="rv-banner-title"><span aria-hidden="true">✕ </span>{o === 'wrong-item' ? 'Paid for the wrong thing' : o === 'stopped' ? 'Stopped' : `Blocked at ${stage}`}: {run.outcome?.reason}{scan != null ? ` Scanner: ${scan} violation${scan === 1 ? '' : 's'}.` : ''}</p>
      {run.findings?.[0] && <p className="rv-banner-sub">In the customer's words: “{run.findings[0].problem}”</p>}
      {effort}
      {!run.site && o === 'blocked' && <p className="rv-banner-actions"><a className="btn small primary" href="#fix" onClick={(e) => { e.preventDefault(); const f = document.getElementById('fix'); f?.scrollIntoView(); f?.focus({ preventScroll: true }); }}>{run.outcome?.status === 'blocked' ? 'Fix it' : 'See the fix'}</a></p>}
    </section>
  );
}

export default function RunView({ id, meta }) {
  const [run, setRun] = useState(null);
  const [events, setEvents] = useState([]);
  const [sel, setSel] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [announce, setAnnounce] = useState(readPref);
  const [metrics, setMetrics] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const headRef = useRef(null);
  const reduced = useReducedMotion();
  const [narrow] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches);

  useEffect(() => {
    setRun(null); setEvents([]); setSel(null); setPlaying(false); setMetrics(null);
    window.scrollTo(0, 0);
    let es;
    api(`/api/runs/${id}`).then((r) => {
      setRun(r);
      setEvents(r.events || []);
      if (r.status === 'running') {
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
      }
    }).catch((e) => setError(e.message));
    return () => es?.close();
  }, [id]);

  useEffect(() => {
    if (run?.status !== 'finished') return;
    api(`/api/runs/${id}/metrics`).then(setMetrics).catch(() => {});
  }, [id, run?.status]);

  const { steps } = useMemo(() => buildSteps(events, run), [events, run]);
  const running = run?.status === 'running';
  const live = running && sel == null;
  const idx = sel == null ? steps.length - 1 : Math.max(0, steps.findIndex((s) => s.n === sel));
  const current = steps[idx];
  const prevStep = idx > 0 ? steps[idx - 1] : null;
  const mode = running ? (live ? 'live' : 'earlier') : 'replay';

  const go = useCallback((i) => {
    if (!steps.length) return;
    const j = Math.max(0, Math.min(steps.length - 1, i));
    setSel(running && j === steps.length - 1 ? null : steps[j].n);
  }, [steps, running]);

  // Playback: one step every 1.8 s at 1x.
  useEffect(() => {
    if (!playing) return;
    if (idx >= steps.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => go(idx + 1), STEP_MS / speed);
    return () => clearTimeout(t);
  }, [playing, idx, speed, steps.length, go]);

  // Preload the next screenshots so playback does not flash.
  useEffect(() => {
    if (!run) return;
    for (const s of steps.slice(idx + 1, idx + 3)) if (s.view?.image) { const im = new Image(); im.src = `/runs-data/${run.id}/${s.view.image}`; }
  }, [idx, steps, run]);

  // The "Deciding… N s" counter ticks only while the live customer is thinking.
  const thinkingLive = live && current?.thinking && !current?.action;
  useEffect(() => {
    if (!thinkingLive) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [thinkingLive]);

  const togglePlay = useCallback(() => {
    if (playing) { setPlaying(false); return; }
    if (idx >= steps.length - 1) go(0);
    setPlaying(true);
  }, [playing, idx, steps.length, go]);

  // Keyboard: Space plays or pauses, Left and Right move one step. Never steals keys from form controls.
  useEffect(() => {
    const on = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable || t?.closest?.('.perceive, .diff')) return;
      if (e.key === ' ' || e.code === 'Space') {
        if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return;
        e.preventDefault(); togglePlay();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault(); setPlaying(false); go(idx + (e.key === 'ArrowRight' ? 1 : -1));
      } else if ((e.key === 'Home' || e.key === 'End') && t?.closest?.('.rv-strip')) {
        e.preventDefault(); setPlaying(false); go(e.key === 'Home' ? 0 : steps.length - 1);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [togglePlay, go, idx, steps.length]);

  // Keep the run header right under the app header, whatever height the app header wraps to.
  useLayoutEffect(() => {
    const h = document.querySelector('.app-header');
    const el = headRef.current;
    if (!h || !el) return;
    const set = () => el.style.setProperty('--rv-top', `${getComputedStyle(h).position === 'sticky' ? h.offsetHeight : 0}px`);
    set();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(set) : null;
    ro?.observe(h);
    return () => ro?.disconnect();
  }, [run?.id]);

  // What the polite live region says: the latest finished move while live, the shown step otherwise.
  const spoken = live ? [...steps].reverse().find((s) => s.final || s.result != null || s.action === 'give_up' || s.action === 'done') : current;
  const message = spoken?.narration?.text && spoken.narration.tone !== 'thinking'
    ? `${spoken.final ? 'Finished.' : `Step ${spoken.n}.`} ${spoken.narration.text}${spoken.circling ? ' Going in circles.' : ''}`
    : '';
  const said = useAnnouncer(message, announce);

  if (error) return <div className="page"><p className="empty" role="alert">{error}</p></div>;
  if (!run) return <div className="page"><p className="empty">Loading…</p></div>;

  const persona = meta.personas[run.persona];
  const outcome = run.outcome && OUTCOME[run.outcome.status];
  const scanTotal = run.scan?.totalViolations;
  const defects = run.defects.map((d) => meta.defects.find((x) => x.id === d)?.short || d);
  const external = !!run.site;
  const chip = CHIP[running ? 'running' : run.outcome?.status] || { label: run.status, tone: 'muted' };
  const total = steps.filter((s) => !s.final).length;
  const where = external ? run.site.host : defects.length ? `Demo shop with ${defects.join(', ')}` : 'Demo shop, no defects';
  const brain = run.brainKind === 'anthropic' ? `Claude API (${run.model})` : run.brainKind === 'external' ? 'Claude Code agent' : run.brainKind;

  return (
    <div className="page rv-page">
      <p className="note rv-crumbs"><a href="#/runs">All runs</a> · {shortDate(run.createdAt)} · {brain}{run.recorded ? ' · recorded run' : ''}{run.label ? ` · ${run.label}` : ''}</p>

      <header className="rv-head" ref={headRef}>
        <div className="rv-who">
          <span className={`rv-avatar ${run.persona}`}><PersonaIcon persona={run.persona} /></span>
          <div className="rv-who-text">
            <h1 className="rv-title">{persona?.label || run.persona}</h1>
            <p className="rv-where">{where}{run.patches?.length ? ` · after an AI fix (${run.patches.length} change${run.patches.length === 1 ? '' : 's'})` : ''}</p>
          </div>
          <span className={`rv-chip ${chip.tone}`}>{chip.tone === 'live' && <span className="rv-live-dot" aria-hidden="true" />}{chip.label}</span>
        </div>
        <StageRail step={current} run={run} />
      </header>

      <div className="rv-theater">
        <section className="rv-left card" aria-labelledby="rv-screen-title">
          <h2 className="sr-only" id="rv-screen-title">What a sighted person would see</h2>
          <Screen runId={run.id} step={current} alt={altFor(current, run, persona?.label)} mode={mode} speed={mode === 'replay' && playing ? speed : null} />
          <div className="rv-controls" role="group" aria-label={running ? 'Step through the run' : 'Replay controls'}>
            <button type="button" className="btn small" onClick={() => { setPlaying(false); go(idx - 1); }} disabled={idx <= 0}><span aria-hidden="true">←</span> Previous</button>
            {!running && (
              <button type="button" className="btn small primary rv-play" onClick={togglePlay} aria-pressed={playing}>
                {playing ? <><span aria-hidden="true">❚❚</span> Pause replay</> : <><span aria-hidden="true">▶</span> {idx >= steps.length - 1 ? 'Replay from start' : 'Play replay'}</>}
              </button>
            )}
            <button type="button" className="btn small" onClick={() => { setPlaying(false); go(idx + 1); }} disabled={idx >= steps.length - 1} >Next <span aria-hidden="true">→</span></button>
            {running && !live && <button type="button" className="btn small primary" onClick={() => { setPlaying(false); setSel(null); }}>Back to live</button>}
            {!running && (
              <span className="rv-speed" role="group" aria-label="Replay speed">
                {SPEEDS.map((s) => <button key={s} type="button" className="btn small" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}x</button>)}
              </span>
            )}
            <span className="rv-hint" aria-hidden="true"><kbd>Space</kbd> {running ? '' : 'play or pause, '}<kbd>←</kbd> <kbd>→</kbd> step</span>
          </div>
          {steps.length > 0 && (
            <div className="rv-strip-wrap">
              <div className="rv-strip-head">
                <h3 className="rv-strip-title">Every step, by checkout stage</h3>
                <p className="rv-legend"><span className="sw ok" aria-hidden="true" /> worked <span className="sw bad" aria-hidden="true" /> failed or blocked</p>
              </div>
              <Filmstrip runId={run.id} steps={steps} current={current} onPick={(n) => { setPlaying(false); setSel(running && n === steps.at(-1)?.n ? null : n); }} />
            </div>
          )}
        </section>

        <div className="rv-right">
          <NowCard step={current} prev={prevStep} run={run} live={live} now={now} total={total} />
          <div className="rv-announce">
            <label className="rv-switch">
              <input type="checkbox" role="switch" checked={announce} onChange={(e) => { setAnnounce(e.target.checked); writePref(e.target.checked); }} />
              <span>Read each step aloud to screen readers</span>
            </label>
          </div>
        </div>
        <details className="rv-perceive card" open={!narrow}>
          <summary>What the customer perceives on this step</summary>
          <p className="note">{run.persona === 'keyboard' ? 'The visible text of the page and where the keyboard focus is.' : 'The accessibility tree: what a screen reader announces and what an AI agent reads.'}</p>
          <pre className="perceive" tabIndex={0} aria-label="Customer perception">{current?.text || '…'}</pre>
        </details>
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-only">{said}</div>

      <OutcomeBanner run={run} steps={steps} metrics={metrics} />

      {run.goalId === 'agentic' && (
        <p className="callout note" style={{ margin: '16px 0' }}>Agentic buyer task: {run.goal.split('"')[1]} {run.goalCheck && <strong>{run.goalCheck.met ? 'It bought the right item.' : `It bought ${run.goalCheck.bought.join(', ')} with ${run.goalCheck.delivery} delivery, which is not what was asked.`}</strong>}</p>
      )}

      <div className="verdict rv-verdict" role="group" aria-label="The scanner's verdict compared with what really happened">
        <div>
          <p className="label">The scanner says</p>
          <p className={`value ${scanTotal === 0 ? 'ok' : scanTotal > 0 ? 'bad' : 'neutral'}`}>{scanTotal == null ? (running ? 'Scanning at the end' : 'Not scanned') : `${scanTotal} violation${scanTotal === 1 ? '' : 's'}`}</p>
          <p className="sub">{external ? `axe-core on each of the ${run.scan?.pages?.length ?? 0} pages the shopper saw, in the state they saw it` : 'axe-core, default rules, the same pages with the same defects and fixes'}</p>
        </div>
        <div>
          <p className="label">What really happened</p>
          <p className={`value ${outcome?.tone || 'neutral'}`}>{running ? `Step ${total}` : run.outcome?.status === 'reached-payment' ? 'Reached payment' : outcome?.tone === 'ok' ? 'Bought it' : outcome?.tone === 'bad' ? 'Could not buy' : outcome?.label || '—'}</p>
          <p className="sub">{run.outcome?.reason}{run.payment ? ` PayPal ${run.payment.mode === 'mock' ? 'mock' : 'sandbox'} order ${run.payment.orderId}: ${run.payment.status}.` : ''}</p>
        </div>
      </div>
      {external && <p className="note" style={{ marginTop: 8 }}>Real site: <a href={run.site.url} target="_blank" rel="noreferrer">{run.site.host}<span className="sr-only"> (opens in a new tab)</span></a>. The customer goes as far as the payment step; nothing is paid.</p>}

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="card" aria-labelledby="found">
          <h2 className="section-title" id="found">What the customer reported</h2>
          {run.findings?.length ? (
            <ul className="findings">{run.findings.map((f, i) => <li key={i}><strong>{f.page}:</strong> {f.problem}</li>)}</ul>
          ) : <p className="note">{running ? 'Reported at the end of the run.' : 'Nothing reported.'}</p>}
          {run.usage && <p className="note">Claude API: {run.usage.requests} requests, {Math.round((run.usage.input + run.usage.cacheRead + run.usage.cacheWrite) / 1000)}k input tokens, about ${run.usage.costUsd?.toFixed(3)}.</p>}
        </section>
        <section className="card" aria-labelledby="steps">
          <h2 className="section-title" id="steps">All {total} steps as text</h2>
          <ol className="timeline rv-steplist">
            {steps.map((s) => (
              <li key={s.n}>
                <button type="button" aria-current={current?.n === s.n ? 'step' : undefined} onClick={() => { setPlaying(false); setSel(running && s.n === steps.at(-1)?.n ? null : s.n); window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); }}>
                  <span className="n">{s.final ? 'end' : s.n}</span>
                  <span><span className={`a tone-${s.narration?.tone}`}>{s.narration?.text}</span>{s.thought && <span className="r" style={{ display: 'block' }}>“{s.thought}”</span>}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {run.status === 'finished' && !external && <FixPanel run={run} meta={meta} />}
    </div>
  );
}
