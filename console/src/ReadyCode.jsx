import React, { useState } from 'react';

// Ready code from a fix: one numbered card per change (the number matches the annotated screenshot and
// the report), before and after side by side, a Copy button per change, and the three downloads.
export default function ReadyCode({ changes = [], fixId, honesty }) {
  const [status, setStatus] = useState('');

  async function copy(c) {
    try {
      await navigator.clipboard.writeText(c.after);
      setStatus(`Change ${c.n} copied to the clipboard.`);
    } catch {
      setStatus(`Copy failed. Select the code of change ${c.n} and copy it by hand.`);
    }
  }

  if (!changes.length) return <p className="note">No fix has been made for this run yet.</p>;
  return (
    <div className="ready-code">
      <p className="callout note">{honesty}</p>
      {fixId && (
        <ul className="row ready-downloads" aria-label="Download the changes">
          <li><a className="btn small" href={`/api/fixes/${fixId}/fix.patch`} download>Download fix.patch</a></li>
          <li><a className="btn small" href={`/api/fixes/${fixId}/changes.json`} download>changes.json</a></li>
          <li><a className="btn small" href={`/api/fixes/${fixId}/changes.md`} download>changes.md</a></li>
        </ul>
      )}
      <ol className="ready-list">
        {changes.map((c) => (
          <li key={c.id} className="card ready-card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 id={`rc-${c.n}`} className="section-title" style={{ margin: 0 }}>
                <span className="ready-n" aria-hidden="true">{c.n}</span>
                {c.element?.selector ? <code>{c.element.selector}</code> : 'Script change'}
                <span className="note"> in {c.file}{c.line ? `, line ${c.line}` : ''}</span>
              </h3>
              <button type="button" className="btn small" onClick={() => copy(c)}>Copy change {c.n}</button>
            </div>
            <p>{c.why}</p>
            {c.wcag && <p className="note">WCAG 2.2: may not meet {c.wcag}; confirm with manual testing.</p>}
            {c.verifiedBy && (
              <p className="note">
                Verified by re-run {c.verifiedBy.runId}: {c.verifiedBy.outcome}
                {c.verifiedBy.paypalOrderId ? `, PayPal ${c.verifiedBy.paypalMode} order ${c.verifiedBy.paypalOrderId} ${c.verifiedBy.paypalStatus}` : ''}.
              </p>
            )}
            <div className="ready-pair">
              <figure>
                <figcaption>Before</figcaption>
                <pre className="ready-before"><code>{c.before}</code></pre>
              </figure>
              <figure>
                <figcaption>After</figcaption>
                <pre className="ready-after"><code>{c.after}</code></pre>
              </figure>
            </div>
          </li>
        ))}
      </ol>
      <p role="status" className="note ready-status">{status}</p>
    </div>
  );
}
