import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { annotatedFigureHtml, ANNOTATE_CSS } from '../../shared/annotate.js';
import ReadyCode from './ReadyCode.jsx';
import './report.css';

// #/report/:kind/:id — the owner report inside the console: verdict, downloads, the annotated
// screenshots, the ready code, and a link to the full printable report (served by the server).
export default function Report({ route }) {
  const [, kind, id] = route.match(/^\/report\/(run|case|site)\/([\w-]+)/) || [];
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setR(null);
    setError('');
    api(`/api/report/${kind}/${id}.json`).then(setR).catch((e) => setError(e.message));
  }, [kind, id]);

  if (error) return <div className="page"><p className="empty" role="alert">{error}</p></div>;
  if (!r) return <div className="page"><p className="empty" role="status">Preparing the report… The first time, the page is rendered again to find the element, which takes a few seconds.</p></div>;

  const full = `/report/${r.kind}/${r.id}`;
  const figures = r.kind === 'site' ? r.findings.filter((f) => f.figure) : r.blockers.filter((b) => b.figure);
  return (
    <div className="page report-view">
      <style>{ANNOTATE_CSS}</style>
      <p className="note"><a href={`#/runs/${r.id}`}>Back to the run</a>{r.rerun && <> · <a href={`#/runs/${r.rerun.id}`}>Re-run after the fix</a></>}</p>
      <p className="eyebrow">Owner report</p>
      <h1>{r.title}</h1>
      <p className={`lead report-verdict ${r.verdict.blocked && !r.verdict.paidAfter ? 'bad' : 'ok'}`}>{r.verdict.headline}</p>
      <p className="note">{r.verdict.sub}</p>

      <ul className="row report-actions" aria-label="Report downloads">
        <li><a className="btn primary" href={r.links.pdf} download>Download PDF</a></li>
        {r.links.patch && <li><a className="btn" href={r.links.patch} download>Download fix.patch</a></li>}
        <li><a className="btn" href={full} target="_blank" rel="noreferrer">Open the full report<span className="sr-only"> (opens in a new tab)</span></a></li>
      </ul>

      {r.scorecard?.claim && (
        <section className="card" aria-labelledby="rv-claim" style={{ marginTop: 20 }}>
          <h2 className="section-title" id="rv-claim">Before and after: {r.scorecard.claim.label}</h2>
          <p>{r.scorecard.claim.text}</p>
          {r.scorecard.claim.baseline && <p>{r.scorecard.claim.baseline}</p>}
        </section>
      )}

      {figures.length > 0 && (
        <section aria-labelledby="rv-where" style={{ marginTop: 24 }}>
          <h2 className="section-title" id="rv-where">{r.kind === 'site' ? 'Where the customer had problems' : 'Where the customer got stuck'}</h2>
          {figures.map((b) => (
            <div key={b.n} className="card" style={{ marginBottom: 16 }}>
              <h3 className="section-title">{b.n}. {b.short || b.page}</h3>
              <div dangerouslySetInnerHTML={{ __html: annotatedFigureHtml({ ...b.figure, idPrefix: `rv${b.n}`, scannerRecorded: b.figure.scannerRecorded, stuckLabel: r.kind === 'site' ? 'Where the customer had the problem' : 'Where the customer got stuck' }) }} />
              <p><a href={`/api/report/${r.kind}/${r.id}/figure-${b.n}.png`} download>Download this screenshot with its marks (PNG)</a></p>
            </div>
          ))}
        </section>
      )}

      {r.kind !== 'site' && (
        <section aria-labelledby="rv-code" style={{ marginTop: 24 }}>
          <h2 className="section-title" id="rv-code">Changes to make</h2>
          <ReadyCode changes={r.changes} fixId={r.fix?.id} honesty={r.honesty} />
        </section>
      )}

      {r.kind === 'site' && (
        <section aria-labelledby="rv-suggest" style={{ marginTop: 24 }}>
          <h2 className="section-title" id="rv-suggest">Suggested changes (not verified on the site)</h2>
          <ol>
            {r.findings.map((f) => <li key={f.n}><strong>{f.page}</strong>: {f.suggestion.map((s) => s.text).join(' ')}</li>)}
          </ol>
        </section>
      )}
    </div>
  );
}
