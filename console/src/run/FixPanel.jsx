import React, { useEffect, useState } from 'react';
import { api, OUTCOME, accessCode, liveOf } from '../api.js';

function Diff({ text }) {
  const lines = (text || '').split('\n').filter((l) => !l.startsWith('===') && !l.startsWith('Index'));
  return (
    <pre className="diff rv-diff" tabIndex={0} aria-label="Changes to the page">
      {lines.map((l, i) => {
        const cls = l.startsWith('@@') ? 'hunk' : l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : '';
        return <div key={i} className={cls} style={{ '--i': i }}>{l || ' '}</div>;
      })}
    </pre>
  );
}

const FIXER_NAME = { nvidia: 'NVIDIA Nemotron', anthropic: 'Claude', external: 'Claude Code agent' };
const STAGES = ['Read the page and the visit', 'Write the change', 'Check it against the page', 'Apply it'];
const STAGE_AT = { writing: 1, retrying: 1, checking: 2, applying: 3, done: 4 };

// A line of HTML with tags, attribute names and values coloured.
function Code({ line }) {
  const parts = [];
  const re = /(<\/?[a-zA-Z][\w-]*)|([\w-:]+)(?==)|("[^"]*")/g;
  let last = 0, m;
  while ((m = re.exec(line))) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    parts.push(<span key={m.index} className={m[1] ? 'fx-tag' : m[2] ? 'fx-attr' : 'fx-str'}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  parts.push(line.slice(last));
  return parts;
}

// While an AI fixer works: who is fixing, how long, which stage, and the page it is reading.
function FixWorking({ fix }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const secs = fix.createdAt ? Math.max(0, Math.round((now - Date.parse(fix.createdAt)) / 1000)) : 0;
  const at = STAGE_AT[fix.stage] ?? 1;
  const lines = fix.preview || [];
  const name = FIXER_NAME[fix.fixer] || 'The AI fixer';
  const said = fix.stage === 'retrying'
    ? `Its answer did not match the page exactly, so ${name} is asked again (try ${fix.attempt} of 3).`
    : fix.stage === 'checking' ? 'Checking that every change matches the page exactly.'
    : fix.stage === 'applying' ? 'Applying the change to the shop.'
    : `${name} is reading the ${fix.page} page and the record of the visit, and writing the smallest change that removes the blocker.`;
  return (
    <div className="fx-work">
      <div className="fx-top">
        <span className="fx-who"><span className="fx-orb" aria-hidden="true"><i /><i /><i /></span>{name}</span>
        <span className="fx-timer" role="timer" aria-live="off">{secs} s</span>
      </div>
      <ol className="fx-steps" aria-label="Fix progress">
        {STAGES.map((t, i) => (
          <li key={t} className={i < at ? 'done' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}>
            <span className="fx-dot" aria-hidden="true">{i < at ? '✓' : i + 1}</span>{t}
          </li>
        ))}
      </ol>
      <p className="fx-said" role="status">{said}</p>
      {lines.length > 0 && (
        <div className="fx-code" aria-hidden="true">
          <div className="fx-code-bar"><span /><span /><span /><em>{fix.page}.html · {fix.htmlLines || lines.length} lines</em></div>
          <div className="fx-code-view">
            <div className="fx-scroll" style={{ '--fx-n': lines.length }}>
              {[0, 1].map((k) => lines.map((l, i) => <div key={`${k}-${i}`}><b>{i + 1}</b><Code line={l} /></div>))}
            </div>
            <div className="fx-beam" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function FixPanel({ run, meta, onPresence }) {
  const [fix, setFix] = useState(null);
  const lv = liveOf(meta);
  const [fixer, setFixer] = useState(lv?.fixer || (meta.claude ? 'anthropic' : 'external'));
  const [error, setError] = useState('');
  const [rerunning, setRerunning] = useState(false);
  const [after, setAfter] = useState(null);

  useEffect(() => {
    // The run of the same shop after this fix, if there is one.
    api('/api/runs').then((list) => setAfter(list.find((r) => r.instanceId === run.instanceId && r.id !== run.id && r.patches?.length && r.createdAt > run.createdAt && r.status === 'finished') || null)).catch(() => {});
  }, [run.id]);

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
    try { const j = await api('/api/fixes', { runId: run.id, fixer, accessCode: accessCode.get() }); setFix({ ...j, runId: run.id }); } catch (e) { setError(e.message); }
  }
  async function rerun() {
    setRerunning(true);
    try {
      const r = await api('/api/runs', { instanceId: run.instanceId, persona: run.persona, brain: run.brainKind === 'scripted' ? 'external' : run.brainKind, label: `re-run after fix ${fix.id}`, accessCode: accessCode.get() });
      location.hash = `#/runs/${r.id}`;
    } catch (e) { setError(e.message); setRerunning(false); }
  }

  const shown = !(run.recorded && !fix);
  useEffect(() => { onPresence?.(shown); }, [shown]);
  if (!shown) return null;
  return (
    <section className="card" id="fix" tabIndex={-1} aria-labelledby="fix-title" style={{ marginTop: 16 }}>
      <h2 className="section-title" id="fix-title">The fix</h2>
      {!fix && (
        <>
          <p className="note">The fixer reads the exact HTML of the page where the shopper got stuck, plus the shopper's transcript, and proposes the smallest change that removes the blocker.</p>
          <div className="row">
            <label className="row note">Fixer
              <select value={fixer} onChange={(e) => setFixer(e.target.value)}>
                {meta.claude && <option value="anthropic">Claude API</option>}
                {lv?.fixer === 'nvidia' && <option value="nvidia">NVIDIA Nemotron</option>}
                {!lv?.codeRequired && <option value="external">Claude Code agent</option>}
              </select>
            </label>
            <button type="button" className="btn primary" onClick={propose}>Propose a fix</button>
          </div>
        </>
      )}
      {fix && fix.status !== 'applied' && fix.status !== 'error' && (
        fix.fixer === 'external' || fixer === 'external'
          ? <p className="note" role="status">Waiting for the fixer. Run <code>node tools/agent.mjs fix-reply {fix.id} reply.json</code> after reading <code>/api/fixes/{fix.id}?full=1</code>.</p>
          : <FixWorking fix={fix} />
      )}
      {fix?.status === 'error' && (
        <div className="fx-fail" role="alert">
          <p><strong>{FIXER_NAME[fix.fixer] || 'The fixer'} did not return a change it could apply{fix.attempt > 1 ? ` after ${fix.attempt} tries` : ''}.</strong> Nothing on the page was changed. AI answers vary, so a new try often works.</p>
          <p className="note">Detail: {fix.error}</p>
          <button type="button" className="btn primary" onClick={() => { setFix(null); setError(''); }}>Try again</button>
        </div>
      )}
      {fix?.status === 'applied' && (
        <>
          {fix.accepted?.length > 0 && <p className="fx-done" role="status"><span className="fx-check" aria-hidden="true">✓</span>Fix applied{fix.fixer && FIXER_NAME[fix.fixer] ? ` by ${FIXER_NAME[fix.fixer]}` : ''}{fix.retries?.length ? `, on try ${fix.retries.length + 1}` : ''}</p>}
          <p><strong>{fix.summary}</strong></p>
          <p className="note">{fix.accepted?.length} {fix.accepted?.length === 1 ? 'change' : 'changes'} applied to the {fix.page} page{fix.rejected?.length ? `, ${fix.rejected.length} rejected because the text did not match exactly` : ''}.</p>
          <Diff text={fix.diff} />
          {after && (
            <p className="callout" style={{ marginTop: 12 }}>
              After the fix, the same customer tried again: <a href={`#/runs/${after.id}`}>{after.outcome?.status === 'purchased' ? `bought it in ${after.steps} steps` : `${OUTCOME[after.outcome?.status]?.label || 'see the run'}`}{after.payment?.status === 'COMPLETED' ? (after.payment.mode === 'mock' ? ', mock payment' : ', and PayPal confirmed the order (sandbox)') : ''}</a>.
            </p>
          )}
          {!run.recorded && !after && (
            <p className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary fx-go" onClick={rerun} disabled={rerunning}>{rerunning ? 'Starting…' : 'Re-run the same shopper'}</button>
            </p>
          )}
        </>
      )}
      {error && <p role="alert" className="pill bad">{error}</p>}
    </section>
  );
}

