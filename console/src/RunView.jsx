import CheckBadge, { CheckLine, CheckLegend } from './CheckBadge.jsx';
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
  'reached-payment': { label: 'Reached payment', tone: 'muted' },
  blocked: { label: 'Blocked', tone: 'bad' },
  'wrong-item': { label: 'Wrong item', tone: 'warn' },
  stopped: { label: 'Stopped', tone: 'muted' },
  error: { label: 'Error', tone: 'bad' },
  'not-testable': { label: 'Not testable', tone: 'muted' },
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

const BLOCKING = /cannot|can't|could not|no way|unable|trapped|impossible|not possible/i;

// What the customer found: the element, the problem, how it was checked, and a link to its step.
// The finding that stopped a blocked run comes first, then the rest in step order.
function FoundList({ findings, checks = [], onStep, blocked }) {
  if (!findings?.length) return null;
  const items = findings.map((f, i) => ({ f, check: checks[i], i }));
  const lead = blocked ? (items.find((x) => BLOCKING.test(x.f.problem || '')) || items[0]) : null;
  const rest = items.filter((x) => x !== lead).sort((x, y) => (x.f.step ?? 1e9) - (y.f.step ?? 1e9) || x.i - y.i);
  const list = lead ? [lead, ...rest] : rest;
  return (
    <div className="rv-found" id="found">
      <p className="rv-found-h">What the customer found ({findings.length})</p>
      <CheckLegend />
      <ol>
        {list.map(({ f, check, i }) => (
          <li key={i} className={lead && lead.i === i ? 'rv-first' : undefined}>
            {f.step != null ? <button type="button" className="rv-step-link" onClick={() => onStep(f.step)}>Step {f.step}<span className="sr-only">: show it in the replay</span></button> : <span />}
            <span className="sr-finding">
              <b title={f.element?.name || f.page}>{lead && lead.i === i && <span className="rv-blocking">Blocking</span>}{f.element?.name ? `${f.element.role || 'element'} “${f.element.name.length > 56 ? `${f.element.name.slice(0, 55)}…` : f.element.name}”` : f.page}</b>
              <span>{f.problem}</span>
              <span className="sr-finding-check"><CheckBadge check={check} /></span>
              <CheckLine check={check} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Plain words for the run checks behind an outcome.
function checkText(run) {
  const o = run.outcome || {};
  if (o.status === 'blocked' && o.claimedDone && run.site) return 'The customer said it had reached payment, but no payment form, card field or enabled Pay button was on screen, so the run does not count as reaching payment.';
  if (o.status === 'blocked' && o.claimedDone) return 'The customer said it was done, but PayPal has no paid order, so the run does not count as a purchase.';
  if (/^The agent gave up\.?$/.test(o.reason || '')) return null;
  return o.reason;
}

function fmtTime(s) {
  if (s == null) return '';
  const v = Math.round(s);
  return v < 60 ? `${v} s` : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')} min`;
}

function OutcomeBanner({ run, steps, metrics, onStep, hasFix }) {
  const o = run.outcome?.status;
  if (!o || run.status === 'running') return null;
  const last = steps.filter((s) => !s.final).at(-1);
  const stage = STAGES[steps.at(-1)?.prevStage ?? last?.stage ?? 0];
  const n = metrics?.steps ?? steps.at(-1)?.counts?.step ?? 0;
  const final = [...(run.events || [])].reverse().find((e) => e.type === 'decide' && (e.action === 'give_up' || e.action === 'done'));
  const why = final?.thought;
  const scan = run.scan?.totalViolations;
  const effort = metrics && (
    <p className="rv-banner-effort">
      {n} steps{run.persona === 'agent' ? '' : ` · ${metrics.keys} keys pressed (${metrics.tabs} Tab)`} · {metrics.deadEnds} failed action{metrics.deadEnds === 1 ? '' : 's'} · {metrics.noEffect} move{metrics.noEffect === 1 ? '' : 's'} that changed nothing
      {metrics.klmSeconds != null && o === 'purchased' && <> · about {fmtTime(metrics.klmSeconds)} for a person (estimate)</>}
      {scan != null && <> · axe-core: {scan === 0 ? 'no issues' : `${scan} issue${scan === 1 ? '' : 's'}`}</>}
    </p>
  );
  const relabel = run.outcome?.reclassified && <p className="rv-banner-sub">Relabelled by hand after checking the screenshots: {run.outcome.reclassified.why}</p>;
  const found = <FoundList findings={run.findings} checks={run.checks} onStep={onStep} blocked={!['purchased', 'reached-payment'].includes(o)} />;
  if (o === 'purchased') {
    const p = run.payment;
    return (
      <section className="rv-banner ok" role="status" aria-label="Outcome">
        <p className="rv-banner-title"><span aria-hidden="true">✓ </span>Paid in {n} steps.{p ? ` ${p.mode === 'mock' ? 'Mock payment' : 'PayPal confirmed the order (sandbox)'}${p.amount != null ? `, $${Number(p.amount).toFixed(2)}` : ''}.` : ''}</p>
        {p && p.mode !== 'mock' && <p className="rv-banner-sub">Verified with PayPal Orders v2: the test counts only because PayPal confirms the order.</p>}
        {effort}
        {found}
      </section>
    );
  }
  if (o === 'reached-payment') {
    return (
      <section className="rv-banner muted" role="status" aria-label="Outcome">
        <p className="rv-banner-title">Reached the payment step of {run.site?.host || 'the shop'} in {n} steps.</p>
        <p className="rv-banner-sub">Stopped there on purpose: AccessiPay never pays, signs in or types card data on a real site.</p>
        {relabel}
        {effort}
        {found}
      </section>
    );
  }
  if (o === 'not-testable') {
    return (
      <section className="rv-banner muted" role="status" aria-label="Outcome">
        <p className="rv-banner-title">Not counted: {run.outcome?.reason}</p>
        <p className="rv-banner-sub">A run that a bot check, a broken demo or our own tooling stopped says nothing about accessibility, so it is left out of the results.</p>
        {relabel}
        {found}
      </section>
    );
  }
  return (
    <section className={`rv-banner ${o === 'wrong-item' ? 'warn' : 'bad'}`} role="status" aria-label="Outcome">
      <p className="rv-banner-title"><span aria-hidden="true">✕ </span>{o === 'wrong-item' ? 'Paid for the wrong thing' : o === 'stopped' ? 'Stopped' : `Stopped at ${stage}`}{why ? <>: “{why}”</> : ''}</p>
      {checkText(run) && <p className="rv-banner-sub">Check: {checkText(run)}</p>}
      {relabel}
      {effort}
      {found}
      {!run.site && o === 'blocked' && hasFix && <p className="rv-banner-actions"><a className="btn small" href="#fix" onClick={(e) => { e.preventDefault(); const f = document.getElementById('fix'); f?.scrollIntoView(); f?.focus({ preventScroll: true }); }}>Jump to the fix <span aria-hidden="true">↓</span></a></p>}
    </section>
  );
}

export default function RunView({ id, meta, onSection }) {
  const [run, setRun] = useState(null);
  const [events, setEvents] = useState([]);
  const [sel, setSel] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [announce, setAnnounce] = useState(readPref);
  const [metrics, setMetrics] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [hasFix, setHasFix] = useState(false);
  const [allSteps, setAllSteps] = useState(false);
  const headRef = useRef(null);
  const reduced = useReducedMotion();
  const [narrow] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches);
  // Large retailers are recorded as text only: no screenshots, so no replay panel either.
  const textOnly = !!run?.site?.anonymized;
  const section = run ? (run.site ? 'results' : 'analytics') : null;
  useEffect(() => { if (section) onSection?.(section); }, [section, id]);

  useEffect(() => {
    setRun(null); setEvents([]); setSel(null); setPlaying(false); setMetrics(null); setHasFix(false); setAllSteps(false);
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

  // Jump the replay to a step a finding points at.
  const goStep = useCallback((n) => {
    if (!steps.some((s) => s.n === n)) return;
    setPlaying(false);
    setSel(n);
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }, [steps, reduced]);

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
      if (textOnly || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable || t?.closest?.('.perceive, .diff')) return;
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
  }, [togglePlay, go, idx, steps.length, textOnly]);

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
  const total = steps.filter((s) => !s.final && !s.closingMove).length;
  const where = external ? run.site.host : defects.length ? `Demo shop with ${defects.join(', ')}` : 'Demo shop, no defects';
  const o = run.outcome?.status;
  // The closing words appear once: in the outcome card, when it quotes them.
  const hideQuote = !running && o && !['purchased', 'reached-payment', 'not-testable'].includes(o);
  const STEP_PREVIEW = 8;
  const listed = allSteps ? steps : steps.slice(0, STEP_PREVIEW);
  const stepList = (
    <section className={`card rv-steps${textOnly ? ' rv-left rv-left-text' : ''}`} aria-labelledby="steps">
      <h2 className="section-title" id="steps">All {total} steps as text</h2>
      <ol className="timeline rv-steplist">
        {listed.map((s) => (
          <li key={s.n}>
            <button type="button" aria-current={current?.n === s.n ? 'step' : undefined} onClick={() => { setPlaying(false); setSel(running && s.n === steps.at(-1)?.n ? null : s.n); if (!textOnly) window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); }}>
              <span className="n">{s.final ? 'end' : s.closingMove ? (s.action === 'done' ? 'done' : 'stop') : s.n}</span>
              <span><span className={`a tone-${s.narration?.tone}`}>{s.narration?.text}</span>{s.thought && !(hideQuote && s.closingMove) && <span className="r" style={{ display: 'block' }}>“{s.thought}”</span>}</span>
            </button>
          </li>
        ))}
      </ol>
      {steps.length > STEP_PREVIEW && (
        <button type="button" className="btn small rv-steps-more" aria-expanded={allSteps} onClick={() => setAllSteps((v) => !v)}>
          {allSteps ? 'Show fewer steps' : `Show all ${total} steps`}
        </button>
      )}
      {run.usage && <p className="note">Claude API: {run.usage.requests} requests, {Math.round((run.usage.input + run.usage.cacheRead + run.usage.cacheWrite) / 1000)}k input tokens, about ${run.usage.costUsd?.toFixed(3)}.</p>}
    </section>
  );

  return (
    <div className="page rv-page">
      <nav className="note rv-crumbs" aria-label="Breadcrumb">
        {external
          ? <><a href="#/results">Results</a><span aria-hidden="true"> › </span><a href={`#/sites/${encodeURIComponent(run.site.host)}`}>{run.site.host}</a><span aria-hidden="true"> › </span>{persona?.label || run.persona}</>
          : <><a href="#/analytics">Analytics</a><span aria-hidden="true"> › </span>{persona?.label || run.persona}, {shortDate(run.createdAt)}</>}
      </nav>

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

      {run.status === 'finished' && (
        <p className="note rv-report-links">
          <a href={`#/report/${run.site ? 'site' : 'run'}/${run.id}`}>Owner report</a>
          {' · '}
          <a href={`/api/report/${run.site ? 'site' : 'run'}/${run.id}.pdf`} download>Download PDF</a>
        </p>
      )}

      <div className="rv-theater">
        {textOnly ? stepList : (
        <section className="rv-left card" aria-labelledby="rv-screen-title">
          <h2 className="sr-only" id="rv-screen-title">What a sighted person would see</h2>
          <Screen runId={run.id} step={current} alt={altFor(current, run, persona?.label)} mode={mode} speed={mode === 'replay' && playing ? speed : null} zoomable={narrow} />
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
        )}

        <div className="rv-right">
          <NowCard step={current} prev={prevStep} run={run} live={live} now={now} total={total} hideQuote={hideQuote} finalEst={metrics?.klmSeconds} partialEst={!(textOnly && run.persona === 'screenreader')} />
          <div className="rv-announce">
            <label className="rv-switch">
              <input type="checkbox" role="switch" checked={announce} onChange={(e) => { setAnnounce(e.target.checked); writePref(e.target.checked); }} />
              <span>Read each step aloud to screen readers</span>
            </label>
          </div>
        </div>
        {!run.site?.anonymized && <details className="rv-perceive card" open={!narrow}>
          <summary>What the customer perceives on this step</summary>
          <p className="note">{run.persona === 'keyboard' ? 'The visible text of the page and where the keyboard focus is.' : 'The accessibility tree: what a screen reader announces and what an AI agent reads.'}</p>
          <pre className="perceive" tabIndex={0} aria-label="Customer perception">{current?.text || '…'}</pre>
        </details>}
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-only">{said}</div>

      <OutcomeBanner run={run} steps={steps} metrics={metrics} onStep={goStep} hasFix={hasFix} />

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
          <p className={`value ${o === 'reached-payment' ? 'neutral' : outcome?.tone || 'neutral'}`}>{running ? `Step ${total}` : o === 'reached-payment' ? 'Reached payment' : o === 'purchased' ? 'Bought it' : outcome?.tone === 'bad' ? 'Could not buy' : outcome?.label || '—'}</p>
          <p className="sub">{/^The agent gave up\.?$/.test(run.outcome?.reason || '') ? 'The customer gave up.' : /payment oracle/.test(run.outcome?.reason || '') ? 'PayPal confirmed the order (sandbox).' : run.outcome?.reason}{run.payment?.status === 'COMPLETED' && !/payment oracle/.test(run.outcome?.reason || '') ? (run.payment.mode === 'mock' ? ' Mock payment.' : ' PayPal confirmed the order (sandbox).') : ''}</p>
        </div>
      </div>
      {external && <p className="note" style={{ marginTop: 8 }}>Real shop{run.site.url ? <>: <a href={run.site.url} target="_blank" rel="noreferrer">{run.site.host}<span className="sr-only"> (opens in a new tab)</span></a></> : ''}. The customer goes as far as the payment step; nothing is paid.</p>}

      {!textOnly && stepList}

      {run.status === 'finished' && !external && <FixPanel run={run} meta={meta} onPresence={setHasFix} />}
    </div>
  );
}
