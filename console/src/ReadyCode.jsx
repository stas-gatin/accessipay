import React, { useState } from 'react';

const same = (list, key) => list.length > 0 && list.every((x) => key(x) === key(list[0]));
const verifiedKey = (v) => (v ? `${v.runId}|${v.outcome}|${v.paypalStatus || ''}` : '');

function Verified({ v }) {
  if (!v) return null;
  const paid = v.outcome === 'purchased';
  return (
    <>
      Verified by a re-run: <a href={`#/runs/${v.runId}`}>the same customer tried again</a>
      {paid ? ` and paid in ${v.steps} steps` : `: ${v.outcome}`}
      {paid && v.paypalStatus === 'COMPLETED' ? (v.paypalMode === 'mock' ? ', with a mock payment' : ', and PayPal confirmed the order (sandbox)') : ''}.
    </>
  );
}

// Ready code from a fix: one numbered card per change (the number matches the annotated screenshot and
// the report), before and after side by side, and a Copy button per change. What every change shares
// (the WCAG criterion, the re-run that verified it) is said once, above the list.
export default function ReadyCode({ changes = [], honesty }) {
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
  const oneWcag = same(changes, (c) => c.wcag || '') && changes[0].wcag;
  const oneVerified = same(changes, (c) => verifiedKey(c.verifiedBy)) && changes[0].verifiedBy;
  return (
    <div className="ready-code">
      <div className="ready-common">
        {oneVerified && <p><Verified v={oneVerified} /></p>}
        {oneWcag && <p className="note">WCAG 2.2: the page as built may not meet {oneWcag}; confirm with manual testing.</p>}
        {honesty && <p className="note">{honesty}</p>}
      </div>
      <ol className="ready-list">
        {changes.map((c) => (
          <li key={c.id} className="card ready-card">
            <div className="ready-head">
              <h3 id={`rc-${c.n}`} className="section-title">
                <span className="ready-n" aria-hidden="true">{c.n}</span>
                {c.element?.selector ? <code>{c.element.selector}</code> : 'Script change'}
                <span className="ready-file">{c.file}{c.line ? `, line ${c.line}` : ''}</span>
              </h3>
              <button type="button" className="btn small" onClick={() => copy(c)}>Copy change {c.n}</button>
            </div>
            <p>{c.why}</p>
            {!oneWcag && c.wcag && <p className="note">WCAG 2.2: may not meet {c.wcag}; confirm with manual testing.</p>}
            {!oneVerified && c.verifiedBy && <p className="note"><Verified v={c.verifiedBy} /></p>}
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
