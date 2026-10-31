import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Pill, StageRail } from './SiteReport.jsx';

// Our own test shop: a problem planted on purpose, the customer stuck on it, the AI fix,
// and the same customer paying through the PayPal sandbox afterwards.

const NAME = { screenreader: 'Screen reader customer', keyboard: 'Keyboard-only customer', agent: 'AI shopping agent' };
const caseHref = (key) => `#/cases/${key}`;
const clip = (t, n) => (t && t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const paid = (s) => s?.outcome === 'purchased';
const money = (n) => `$${Number(n).toFixed(2)}`;

// One line per side: how the run ended, in steps.
function sideLine(s) {
  if (!s) return '';
  const n = s.metrics?.steps;
  if (paid(s)) return n != null ? `Paid in ${n} steps` : 'Paid';
  return n != null ? `Gave up after ${n} steps` : 'Gave up';
}

// The cases at the top of Results: a small before and after picture each, and a link to the whole case.
export function TestShopCases() {
  const [list, setList] = useState(null);
  useEffect(() => { api('/api/test-shop').then(setList).catch(() => setList([])); }, []);
  if (list && !list.length) return null;
  return (
    <section className="ts" aria-labelledby="ts-h">
      <h2 id="ts-h">Our test shop: planted problems, fixed by AI, paid with PayPal</h2>
      <p className="lead">We built this shop and broke it on purpose. In each case a customer gets stuck, the AI rewrites the page, and the same customer tries again. A case passes only when the PayPal sandbox confirms the order.</p>
      {list === null ? <p className="empty">Loading…</p> : (
        <ul className="ts-grid">
          {list.map((c) => (
            <li key={c.key}>
              <a className="card ts-case" href={caseHref(c.key)}>
                <span className="ts-pics">
                  {!c.before && <span className="ts-pic ts-pic-none">No planted problem: the check is the PayPal card fields</span>}
                  {c.before && (
                    <span className="ts-pic">
                      {c.before.shot && <img src={c.before.shot} alt="" loading="lazy" />}
                      <span className={`ts-tag ${paid(c.before) ? 'slow' : 'bad'}`}>{paid(c.before) ? 'Before: slow' : 'Before: stuck'}</span>
                    </span>
                  )}
                  <span className="ts-pic">
                    {c.after.shot && <img src={c.after.shot} alt="" loading="lazy" />}
                    <span className="ts-tag ok">{c.before ? 'After: paid' : 'Paid'}</span>
                  </span>
                </span>
                <span className="ts-who">{NAME[c.persona]}</span>
                <b className="ts-title">{c.title}</b>
                <span className="ts-line">
                  {c.before && <>{sideLine(c.before)} <span aria-hidden="true">→</span> </>}
                  {sideLine(c.after)}
                </span>
                <span className="ts-meta">
                  {c.after.changes > 0 && <span>{c.after.changes} AI change{c.after.changes === 1 ? '' : 's'}</span>}
                  {c.after.payment && <span>PayPal sandbox: {c.after.payment.status}</span>}
                </span>
                <span className="ts-open">Open the case <span aria-hidden="true">→</span></span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// One side of a case as a card: the screen, a button to the full run, a short summary.
function SideCard({ title, s, persona, fallbackCap }) {
  const top = [...s.findings].sort((a, b) => (a.step ?? 1e9) - (b.step ?? 1e9)).slice(0, 2);
  const cap = paid(s) ? (s.payment ? `PayPal order ${s.payment.status}` : 'Paid') : fallbackCap || 'Where it got stuck';
  return (
    <article className={`card sr-card ${paid(s) ? 'ok' : 'bad'}`}>
      <header className="sr-card-head">
        <h2 className="ts-side-h">{title}</h2>
        <Pill outcome={s.outcome} />
      </header>
      <a className="sr-card-shot ts-shot" href={`#/runs/${s.id}`} aria-label={`${title}: open the detailed analysis of the run`}>
        {s.shot && <img src={s.shot} alt="" loading="lazy" />}
        <span className="sr-card-cap">{cap}</span>
      </a>
      <a className="btn primary sr-card-btn" href={`#/runs/${s.id}`}>See the detailed analysis</a>
      <StageRail run={{ status: 'finished', outcome: { status: s.outcome } }} metrics={s.metrics} />
      {s.metrics && <p className="sr-card-nums">{s.metrics.steps} steps{persona !== 'agent' ? ` · ${s.metrics.keys} keys` : ''}{s.payment ? ` · ${money(s.payment.amount)} paid in the PayPal sandbox` : ''}</p>}
      {s.reason && <p className="sr-col-why">“{clip(s.reason, 170)}”</p>}
      {top.length > 0 && (
        <ul className="sr-card-top">
          {top.map((f, i) => <li key={i}><span className="sr-card-step">Step {f.step ?? '–'}</span> {clip(f.problem, 130)}</li>)}
        </ul>
      )}
      {s.findings.length > top.length && <p className="sr-card-more">and {s.findings.length - top.length} more in the detailed analysis</p>}
    </article>
  );
}

// A whole case on its own page.
export function CasePage({ caseKey }) {
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/api/test-shop/${caseKey}`).then(setC).catch((e) => setError(e.message || 'Not found')); }, [caseKey]);
  const back = <p className="note sr-back"><a href="#/results">← All results</a></p>;
  if (error) return <div className="page results">{back}<p className="empty">{error}</p></div>;
  if (!c) return <div className="page results">{back}<p className="empty">Loading…</p></div>;
  const { before, after, fix } = c;
  return (
    <div className="page results ts-page">
      {back}
      <p className="eyebrow">Test shop · {NAME[c.persona]}</p>
      <h1>{c.title}</h1>
      <p className="lead">{c.problem}</p>

      <ol className="ts-flow" aria-label="What happened">
        {before && <li className={paid(before) ? 'slow' : 'bad'}><b>{paid(before) ? 'Slow' : 'Stuck'}</b><span>{sideLine(before)}</span></li>}
        {before && <li className="fix"><b>AI fix</b><span>{after.changes} change{after.changes === 1 ? '' : 's'} to the page</span></li>}
        <li className="ok"><b>Paid</b><span>{sideLine(after)}{after.payment ? `, PayPal order ${after.payment.status}` : ''}</span></li>
      </ol>

      <div className={`ts-sides${before ? '' : ' one'}`}>
        {before && <SideCard title="Before the fix" s={before} persona={c.persona} fallbackCap={paid(before) ? 'Paid, after many steps' : undefined} />}
        <SideCard title={before ? 'After the fix' : 'The run'} s={after} persona={c.persona} />
      </div>
      {c.key === 'skip-link' && <p className="note">The first picture is the page the customer had to tab through: 25 category links before the products.</p>}

      {fix && (
        <section className="card ts-fix" aria-labelledby="ts-fix-h">
          <h2 id="ts-fix-h">What the AI changed</h2>
          <p>{fix.summary}</p>
          <ol className="ts-changes">
            {fix.changes.map((ch, i) => (
              <li key={i}>
                <p className="ts-why">{ch.why}</p>
                <pre className="ts-code"><span className="del">- {clip(ch.find, 240)}</span>{'\n'}<span className="add">+ {clip(ch.replace, 240)}</span></pre>
              </li>
            ))}
          </ol>
          {before && <p><a href={`#/report/case/${before.id}`}>Open the owner report: the fix list, the ready code and a PDF <span aria-hidden="true">→</span></a></p>}
        </section>
      )}
    </div>
  );
}
