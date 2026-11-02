import React, { useEffect, useState } from 'react';
import { api, OUTCOME, accessCode, liveOf } from '../api.js';

function Diff({ text }) {
  const lines = (text || '').split('\n').filter((l) => !l.startsWith('===') && !l.startsWith('Index'));
  return (
    <pre className="diff rv-diff" tabIndex={0} aria-label="Changes to the page">
      {lines.map((l, i) => {
        const cls = l.startsWith('@@') ? 'hunk' : l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : '';
        return <div key={i} className={cls}>{l || ' '}</div>;
      })}
    </pre>
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
          <p className="note">{fix.accepted?.length} {fix.accepted?.length === 1 ? 'change' : 'changes'} applied to the {fix.page} page{fix.rejected?.length ? `, ${fix.rejected.length} rejected because the text did not match exactly` : ''}.</p>
          <Diff text={fix.diff} />
          {after && (
            <p className="callout" style={{ marginTop: 12 }}>
              After the fix, the same customer tried again: <a href={`#/runs/${after.id}`}>{after.outcome?.status === 'purchased' ? `bought it in ${after.steps} steps` : `${OUTCOME[after.outcome?.status]?.label || 'see the run'}`}{after.payment?.status === 'COMPLETED' ? (after.payment.mode === 'mock' ? ', mock payment' : ', and PayPal confirmed the order (sandbox)') : ''}</a>.
            </p>
          )}
          {!run.recorded && !after && (
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

