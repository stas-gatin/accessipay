import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { annotationSvg, annotationAlt, ANNOTATE_CSS } from '../../shared/annotate.js';
import ReadyCode from './ReadyCode.jsx';
import './report.css';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Accessible names read out a close button as "×": that sign means nothing in a sentence.
const clean = (s) => String(s ?? '').replace(/[×✕✖]\s*/g, '').replace(/\s{2,}/g, ' ').trim();

// The ellipse drawn around a mark passes through the corners of its box, which cuts through a popup's
// title. Grow the box so the ellipse goes round the whole element, kept inside the screenshot.
function roomy(box, W, H) {
  if (!box) return box;
  const rx = (box.width / 2) * Math.SQRT2 + 10;
  const ry = (box.height / 2) * Math.SQRT2 + 10;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const w = Math.max(box.width, 2 * (Math.min(rx, cx - 4, W - cx - 4) - 16));
  const h = Math.max(box.height, 2 * (Math.min(ry, cy - 4, H - cy - 4) - 14));
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

// The annotated screenshot: the callout on the picture carries the title only; the full note is the
// numbered list under it (said once, not cut off).
function figureHtml(fig, idPrefix, stuckLabel) {
  const W = fig.width;
  const H = fig.height;
  const marks = fig.marks.map((m) => (m.kind === 'scanner' || m.kind === 'context'
    ? m
    : { ...m, title: clean(m.title), note: clean(m.note), box: roomy(m.box, W, H) }));
  const onPicture = marks.map((m) => (m.kind === 'scanner' || m.kind === 'context' ? m : { ...m, note: '' }));
  const main = marks.filter((m) => m.kind !== 'scanner' && m.kind !== 'context');
  const scanner = marks.filter((m) => m.kind === 'scanner');
  const alt = annotationAlt({ marks, caption: fig.caption, scannerRecorded: fig.scannerRecorded });
  const svg = annotationSvg({ width: W, height: H, marks: onPicture, idPrefix, animate: true });
  // The legend lists only marks that are drawn: no blue entry when the scanner flagged nothing here.
  const scanKey = scanner.length ? ` <span class="ap-key ap-key-blue" aria-hidden="true"></span> What axe-core flagged (${scanner.length})` : '';
  return `<figure class="ap-figure">
<div class="ap-annot" role="img" aria-label="${esc(alt)}" style="aspect-ratio:${W}/${H}">
<img src="${esc(fig.src)}" alt="" width="${W}" height="${H}">
${svg}
</div>
<p class="ap-legend"><span class="ap-key ap-key-red" aria-hidden="true"></span> ${esc(stuckLabel)}${scanKey}</p>
${main.length ? `<ol class="ap-notes">${main.map((m) => `<li value="${esc(m.n)}"><strong>${esc(m.title || 'Element')}</strong>: ${esc(m.note)}</li>`).join('')}</ol>` : ''}
${fig.caption ? `<figcaption>${esc(fig.caption)}</figcaption>` : ''}
</figure>`;
}

// The headline without the PayPal order id: the id is evidence, shown small under it.
function headline(r) {
  const h = r.verdict.headline || '';
  const m = h.match(/^(.*?)[:,]?\s*PayPal (sandbox|mock) order (\S+) is (\w+)\.?$/);
  if (!m) return { text: h, order: null };
  const sandbox = m[2] === 'sandbox';
  return {
    text: `${m[1].replace(/[\s:,]+$/, '')}${m[4] === 'COMPLETED' ? (sandbox ? ', and PayPal confirmed the order (sandbox).' : ' with a mock payment.') : '.'}`,
    order: { id: m[3], mode: m[2] },
  };
}

function scannerLine(sub) {
  const m = (sub || '').match(/axe-core [\d.]+ reported 0 violations on the (\d+) /);
  if (m) return `An automated accessibility scanner (axe-core) found nothing wrong on these ${m[1]} pages.`;
  return sub;
}

// #/report/:kind/:id: the owner report inside the console: verdict, downloads, the annotated
// screenshots and the ready code.
export default function Report({ route, from, onSection }) {
  const [, kind, id] = route.match(/^\/report\/(run|case|site)\/([\w-]+)/) || [];
  // The breadcrumb leads back where the report was opened from: a test-shop case or a shop's analysis.
  const top = from?.tab || (kind === 'site' ? 'results' : 'analytics');
  const back = from?.route?.startsWith('/cases') ? { href: `#${from.route}`, label: 'Test shop case' }
    : from?.route?.startsWith('/sites') ? { href: `#${from.route}`, label: 'Shop analysis' } : null;
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { onSection?.(kind === 'site' ? 'results' : 'analytics'); }, [kind]);
  useEffect(() => {
    setR(null);
    setError('');
    api(`/api/report/${kind}/${id}.json`).then(setR).catch((e) => setError(e.message));
  }, [kind, id]);

  if (error) return <div className="page"><p className="empty" role="alert">{error}</p></div>;
  if (!r) return <div className="page"><p className="empty" role="status">Preparing the report… The first time, the page is rendered again to find the element, which takes a few seconds.</p></div>;

  const figures = r.kind === 'site' ? r.findings.filter((f) => f.figure) : r.blockers.filter((b) => b.figure);
  const head = headline(r);
  const stuck = r.kind === 'site' ? 'Where the customer had the problem' : 'Where the customer got stuck';
  return (
    <div className="page report-view">
      <style>{ANNOTATE_CSS}</style>
      <nav className="note report-crumbs" aria-label="Breadcrumb">
        <a href={`#/${top}`}>{top === 'results' ? 'Results' : 'Analytics'}</a><span aria-hidden="true"> › </span>
        {back && <><a href={back.href}>{back.label}</a><span aria-hidden="true"> › </span></>}
        Owner report
      </nav>
      <p className="note"><a href={`#/runs/${r.id}`}>Back to the run</a>{r.rerun && <> · <a href={`#/runs/${r.rerun.id}`}>Re-run after the fix</a></>}</p>
      <p className="eyebrow">Owner report</p>
      <h1>{r.title}</h1>
      <p className="lead report-verdict">{head.text}</p>
      {head.order && <p className="report-order">PayPal {head.order.mode} order {head.order.id}</p>}
      <p className="note report-scanner">{scannerLine(r.verdict.sub)}</p>

      <ul className="report-actions" aria-label="Report downloads">
        <li><a className="btn primary" href={r.links.pdf} download>Download PDF</a></li>
        {r.links.patch && <li><a className="btn" href={r.links.patch} download>Download fix.patch</a></li>}
        <li><a className="btn" href={`#/runs/${r.id}`}>Open the run</a></li>
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
              <h3 className="section-title">{b.n}. {clean(b.short || b.page)}</h3>
              <div dangerouslySetInnerHTML={{ __html: figureHtml(b.figure, `rv${b.n}`, stuck) }} />
              <p><a href={`/api/report/${r.kind}/${r.id}/figure-${b.n}.png`} download>Download this screenshot with its marks (PNG)</a></p>
            </div>
          ))}
        </section>
      )}

      {r.kind !== 'site' && (
        <section aria-labelledby="rv-code" style={{ marginTop: 24 }}>
          <h2 className="section-title" id="rv-code">Changes to make</h2>
          <ReadyCode changes={r.changes} honesty={r.honesty} />
        </section>
      )}

      {r.kind === 'site' && (
        <>
          <section className="card" aria-labelledby="rv-score" style={{ marginTop: 24 }}>
            <h2 className="section-title" id="rv-score">Scorecard</h2>
            <dl className="report-score">
              {r.scorecard.rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd className={String(row.values[0] ?? '').length > 14 ? 'long' : undefined}>{String(row.values[0] ?? '—')}</dd></div>)}
            </dl>
          </section>
          <section aria-labelledby="rv-findings" style={{ marginTop: 24 }}>
            <h2 className="section-title" id="rv-findings">Findings and suggested changes</h2>
            <p className="note">Reported by the AI customer, then checked again without AI against the record of its run. Nothing was paid and no order was placed.</p>
            {r.findings.map((f) => (
              <article key={f.n} className="card report-finding" aria-labelledby={`rv-f${f.n}`}>
                <h3 className="section-title" id={`rv-f${f.n}`}>{f.n}. {f.page}</h3>
                <p><span className={`check-badge ${f.notDefect ? 'muted' : ['confirmed', 'partly'].includes(f.check?.status) ? 'ok' : 'warn'}`}>{f.notDefect ? 'Not an accessibility defect' : f.confidence}</span>
                  {f.check?.evidence && f.check.status !== 'manual' && <span className="note"> {f.check.evidence}</span>}</p>
                <dl className="report-kv">
                  <div><dt>Where</dt><dd>{f.url || f.page}{f.step ? `, step ${f.step}` : ''}</dd></div>
                  <div><dt>In the customer’s words</dt><dd><blockquote>{f.problem}</blockquote></dd></div>
                  <div><dt>Scanner</dt><dd>{f.scanner}</dd></div>
                  <div><dt>Suggested change (not verified on the site)</dt><dd>{f.suggestion.map((s) => s.text).join(' ')}</dd></div>
                </dl>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
