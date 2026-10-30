import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, OUTCOME, shortDate } from './api.js';

// Groups the flat event list into steps: what was perceived, what was decided, what happened.
function toSteps(events) {
  const steps = new Map();
  const at = (n) => { if (!steps.has(n)) steps.set(n, { n }); return steps.get(n); };
  for (const e of events) {
    if (e.type === 'observe') Object.assign(at(e.step), { image: e.image, text: e.text, title: e.title });
    if (e.type === 'decide') Object.assign(at(e.step), { action: e.action, args: e.args, thought: e.thought });
    if (e.type === 'act') at(e.step).result = e.result;
  }
  const end = events.find((e) => e.type === 'end');
  const list = [...steps.values()].sort((a, b) => a.n - b.n);
  if (end) list.push({ n: 'end', image: end.image, text: end.text, title: end.title, final: true });
  return list;
}

function describe(s) {
  if (s.final) return 'Final page';
  if (!s.action) return '…';
  const a = s.args || {};
  const target = a.name ? ` "${a.name}"` : a.key ? ` ${a.key}` : a.text ? ` "${a.text}"` : '';
  return `${s.action}${target}`;
}

function Diff({ text }) {
  const lines = (text || '').split('\n').filter((l) => !l.startsWith('===') && !l.startsWith('Index'));
  return (
    <pre className="diff" aria-label="Changes to the page">
      {lines.map((l, i) => {
        const cls = l.startsWith('@@') ? 'hunk' : l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : '';
        return <div key={i} className={cls}>{l || ' '}</div>;
      })}
    </pre>
  );
}

function FixPanel({ run, meta }) {
  const [fix, setFix] = useState(null);
  const [fixer, setFixer] = useState(meta.claude ? 'anthropic' : 'external');
  const [error, setError] = useState('');
  const [rerunning, setRerunning] = useState(false);

  useEffect(() => {
    // Show the latest fix made for this run, if any.
    api('/api/fixes').then((list) => { const f = list.filter((x) => x.runId === run.id).at(-1); if (f) setFix(f); }).catch(() => {});
  }, [run.id]);

  useEffect(() => {
    if (!fix || fix.status === 'applied' || fix.status === 'error') return;
    const t = setInterval(() => api(`/api/fixes/${fix.id}`).then(setFix).catch(() => {}), 1500);
    return () => clearInterval(t);
  }, [fix]);

  async function propose() {
    setError('');
    try { const j = await api('/api/fixes', { runId: run.id, fixer }); setFix({ ...j, runId: run.id }); } catch (e) { setError(e.message); }
  }
  async function rerun() {
    setRerunning(true);
    try {
      const r = await api('/api/runs', { instanceId: run.instanceId, persona: run.persona, brain: run.brainKind === 'scripted' ? 'external' : run.brainKind, label: `re-run after fix ${fix.id}` });
      location.hash = `#/runs/${r.id}`;
    } catch (e) { setError(e.message); setRerunning(false); }
  }

  if (run.recorded && !fix) return null;
  return (
    <section className="card" aria-labelledby="fix-title" style={{ marginTop: 16 }}>
      <h2 className="section-title" id="fix-title">Fix it</h2>
      {!fix && (
        <>
          <p className="note">The fixer reads the exact HTML of the page where the shopper got stuck, plus the shopper's transcript, and proposes the smallest change that removes the blocker.</p>
          <div className="row">
            <label className="row note">Fixer
              <select value={fixer} onChange={(e) => setFixer(e.target.value)}>
                {meta.claude && <option value="anthropic">Claude API</option>}
                <option value="external">Claude Code agent</option>
              </select>
            </label>
            <button type="button" className="btn primary" onClick={propose}>Propose a fix</button>
          </div>
        </>
      )}
      {fix && fix.status !== 'applied' && fix.status !== 'error' && (
        <p className="note" role="status">
          {fix.fixer === 'external' || fixer === 'external'
            ? <>Waiting for the fixer. Run <code>node tools/agent.mjs fix-reply {fix.id} reply.json</code> after reading <code>/api/fixes/{fix.id}?full=1</code>.</>
            : 'The fixer is reading the page…'}
        </p>
      )}
      {fix?.status === 'error' && <p role="alert" className="pill bad">{fix.error}</p>}
      {fix?.status === 'applied' && (
        <>
          <p><strong>{fix.summary}</strong></p>
          <p className="note">{fix.accepted?.length} change(s) applied to the {fix.page} page{fix.rejected?.length ? `, ${fix.rejected.length} rejected because the text did not match exactly` : ''}.</p>
          <Diff text={fix.diff} />
          {!run.recorded && (
            <p className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary" onClick={rerun} disabled={rerunning}>{rerunning ? 'Starting…' : 'Re-run the same shopper'}</button>
            </p>
          )}
        </>
      )}
      {error && <p role="alert" className="pill bad">{error}</p>}
    </section>
  );
}

export default function RunView({ id, meta }) {
  const [run, setRun] = useState(null);
  const [events, setEvents] = useState([]);
  const [sel, setSel] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const followRef = useRef(true);

  useEffect(() => {
    setRun(null); setEvents([]); setSel(null); followRef.current = true;
    let es;
    api(`/api/runs/${id}`).then((r) => {
      setRun(r);
      setEvents(r.events || []);
      if (r.status === 'running') {
        es = new EventSource(`/api/runs/${id}/events`);
        let seen = (r.events || []).length;
        let i = 0;
        es.onmessage = (m) => {
          i += 1;
          if (i <= seen) return;
          const e = JSON.parse(m.data);
          setEvents((prev) => [...prev, e]);
          if (e.type === 'finished') { es.close(); api(`/api/runs/${id}`).then(setRun); }
        };
      }
    }).catch((e) => setError(e.message));
    return () => es?.close();
  }, [id]);

  const steps = useMemo(() => toSteps(events), [events]);
  const current = sel == null ? steps.at(-1) : steps.find((s) => s.n === sel) || steps.at(-1);

  useEffect(() => {
    if (!playing) return;
    const idx = steps.findIndex((s) => s.n === current?.n);
    if (idx >= steps.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setSel(steps[idx + 1].n), 1100);
    return () => clearTimeout(t);
  }, [playing, current, steps]);

  if (error) return <div className="page"><p className="empty" role="alert">{error}</p></div>;
  if (!run) return <div className="page"><p className="empty">Loading…</p></div>;

  const persona = meta.personas[run.persona];
  const outcome = run.outcome && OUTCOME[run.outcome.status];
  const scanTotal = run.scan?.totalViolations;
  const defects = run.defects.map((d) => meta.defects.find((x) => x.id === d)?.title || d);

  return (
    <div className="page">
      <p className="note"><a href="#/runs">All runs</a> · {shortDate(run.createdAt)} · {run.brainKind === 'anthropic' ? `Claude API (${run.model})` : run.brainKind === 'external' ? 'Claude Code agent' : run.brainKind}{run.recorded ? ' · recorded run' : ''}</p>
      <h1>{persona?.label}<br /><span style={{ color: run.status === 'running' ? 'var(--muted)' : outcome?.tone === 'ok' ? 'var(--lime)' : 'var(--red)' }}>{run.status === 'running' ? 'is shopping…' : outcome?.tone === 'ok' ? 'bought it' : 'could not buy'}</span></h1>
      <p className="lead">
        Shop: {defects.length ? defects.join('; ') : 'clean, no defects'}{run.patches?.length ? ` · with ${run.patches.length} fix change(s) applied` : ''}.
      </p>

      <div className="versus" role="group" aria-label="Scanner compared with the real outcome">
        <div>
          <p className="section-title">What the scanner says (axe-core, all rules)</p>
          <p className={`big-number ${scanTotal === 0 ? 'ok' : scanTotal > 0 ? 'bad' : ''}`}>{scanTotal == null ? (run.status === 'running' ? '…' : 'not scanned') : `${scanTotal} violation${scanTotal === 1 ? '' : 's'}`}</p>
          <p className="note">Same pages, same state, same defects and fixes.</p>
        </div>
        <div>
          <p className="section-title">What actually happened</p>
          <p className={`big-number ${outcome?.tone || ''}`}>{run.status === 'running' ? `Step ${steps.filter((s) => !s.final).length}…` : outcome?.label || '—'}</p>
          <p className="note">{run.outcome?.reason}{run.payment ? ` PayPal ${run.payment.mode === 'mock' ? '(mock)' : 'sandbox'} order ${run.payment.orderId}: ${run.payment.status}.` : ''}</p>
        </div>
      </div>

      <div className="run-layout">
        <section className="card" aria-labelledby="see">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="section-title" id="see" style={{ margin: 0 }}>What a sighted person would see · {current?.final ? 'end' : `step ${current?.n ?? ''}`}</h2>
            <button type="button" className="btn small" onClick={() => { if (!playing && current?.n === steps.at(-1)?.n) setSel(steps[0]?.n); setPlaying(!playing); }}>{playing ? 'Pause' : 'Replay'}</button>
          </div>
          {current?.image ? <img className="shot" style={{ marginTop: 10 }} src={`/runs-data/${run.id}/${current.image}`} alt={`Screenshot of ${current.title || 'the page'}`} /> : <p className="empty">No screenshot yet.</p>}
        </section>

        <section className="card" aria-labelledby="hear">
          <h2 className="section-title" id="hear">What the shopper perceives</h2>
          <pre className="perceive" tabIndex={0} aria-label="Shopper perception">{current?.text || '…'}</pre>
          {current?.action && (
            <div className="decision">
              <div><strong>Decided:</strong> <code>{describe(current)}</code></div>
              {current.thought && <div className="note">“{current.thought}”</div>}
              {current.result && <div className="result">→ {current.result}</div>}
            </div>
          )}
        </section>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="card" aria-labelledby="steps">
          <h2 className="section-title" id="steps">Steps ({steps.filter((s) => !s.final).length})</h2>
          <ol className="timeline">
            {steps.map((s) => (
              <li key={s.n}>
                <button type="button" aria-current={current?.n === s.n ? 'step' : undefined} onClick={() => { setPlaying(false); setSel(s.n); }}>
                  <span className="n">{s.final ? 'end' : s.n}</span>
                  <span><span className="a">{describe(s)}</span><span className="r" style={{ display: 'block' }}>{s.result || s.title || ''}</span></span>
                </button>
              </li>
            ))}
          </ol>
        </section>
        <section className="card" aria-labelledby="found">
          <h2 className="section-title" id="found">What the shopper reported</h2>
          {run.findings?.length ? (
            <ul className="findings">{run.findings.map((f, i) => <li key={i}><strong>{f.page}:</strong> {f.problem}</li>)}</ul>
          ) : <p className="note">{run.status === 'running' ? 'Reported at the end of the run.' : 'Nothing reported.'}</p>}
          {run.usage && <p className="note">Claude API: {run.usage.requests} requests, {Math.round((run.usage.input + run.usage.cacheRead + run.usage.cacheWrite) / 1000)}k input tokens, about ${run.usage.costUsd?.toFixed(3)}.</p>}
        </section>
      </div>

      {run.status === 'finished' && <FixPanel run={run} meta={meta} />}
    </div>
  );
}
