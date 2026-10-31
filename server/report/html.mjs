// Report pages as server-rendered HTML (template strings, no React), so the page and the PDF print
// the same. Light palette only; print CSS turns each blocker into its own page.

import { annotatedFigureHtml, ANNOTATE_CSS, cleanText } from '../../shared/annotate.js';
import { PERSONAS } from '../engine/session.mjs';
import { customer, wcagList } from './model.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '');
const personaName = (p) => PERSONAS[p]?.label || p;
const args = (a) => Object.entries(a || {}).map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`).join(', ');

// The headline without the PayPal order id (the same wording as the console's Report.jsx): the id is
// evidence, shown on a small line under it.
function headline(r) {
  const h = r.verdict.headline || '';
  const m = h.match(/^(.*?)[:,]?\s*PayPal (sandbox|mock) order (\S+) is (\w+)\.?$/);
  if (!m) return { text: h, order: null };
  const sandbox = m[2] === 'sandbox';
  return {
    text: `${m[1].replace(/[\s:,]+$/, '')}${m[4] === 'COMPLETED' ? (sandbox ? ', and PayPal confirmed the order (sandbox).' : ' with a mock payment.') : '.'}`,
    order: { id: m[3], mode: m[2], status: m[4] },
  };
}

// The scanner result as a plain sentence.
function scannerLine(r) {
  const m = (r.verdict.sub || '').match(/axe-core [\d.]+ reported (\d+) violations? (?:on|across) the (\d+) /);
  if (!m) return r.verdict.sub;
  const n = Number(m[1]);
  const where = m[2] === '1' ? 'on this page' : `on these ${m[2]} pages`;
  return n === 0
    ? `An automated accessibility scanner (axe-core) found nothing wrong ${where}.`
    : `An automated accessibility scanner (axe-core) found ${n} problem${n === 1 ? '' : 's'} ${where}.`;
}

// "Verified by a re-run" in the console's words.
function verifiedText(v) {
  if (!v) return '';
  const paid = v.outcome === 'purchased';
  const pp = paid && v.paypalStatus === 'COMPLETED' ? (v.paypalMode === 'mock' ? ', with a mock payment' : ', and PayPal confirmed the order (sandbox)') : '';
  const steps = v.steps != null ? ` in ${esc(v.steps)} steps` : '';
  return `Verified by a re-run (${esc(v.runId)}): the same customer tried again${paid ? ` and paid${steps}` : `: ${esc(v.outcome)}`}${pp}.`;
}

const CSS = `
@font-face{font-family:Inter;font-weight:400;font-display:swap;src:url(/report/assets/fonts/inter-latin-400-normal.woff2) format('woff2')}
@font-face{font-family:Inter;font-weight:600;font-display:swap;src:url(/report/assets/fonts/inter-latin-600-normal.woff2) format('woff2')}
@font-face{font-family:Inter;font-weight:700;font-display:swap;src:url(/report/assets/fonts/inter-latin-700-normal.woff2) format('woff2')}
@font-face{font-family:'JetBrains Mono';font-weight:400;font-display:swap;src:url(/report/assets/fonts/jetbrains-mono-latin-400-normal.woff2) format('woff2')}
@font-face{font-family:'JetBrains Mono';font-weight:700;font-display:swap;src:url(/report/assets/fonts/jetbrains-mono-latin-700-normal.woff2) format('woff2')}
:root{--ink:#0b1b33;--muted:#4a586b;--line:#d5dce6;--soft:#f6f8fb;--ok:#05664c;--ok-soft:#e7f5ef;--bad:#a82a1f;--bad-soft:#fdecea;--blue:#1d4ed8;--warn:#7a4e00;--warn-soft:#fff4dc}
*{box-sizing:border-box}
html{background:#ffffff}
body{margin:0;background:#ffffff;color:var(--ink);font:16px/1.55 Inter,system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
a{color:#0b4f8a}
a:focus-visible,button:focus-visible{outline:3px solid #0b4f8a;outline-offset:2px;border-radius:4px}
.skip{position:absolute;left:-9999px;top:8px;background:#fff;padding:8px 12px;border:2px solid var(--ink);z-index:5}
.skip:focus{left:16px}
.top{display:flex;flex-wrap:wrap;gap:10px 24px;align-items:center;justify-content:space-between;max-width:920px;margin:0 auto;padding:18px 24px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px}
.tools ul{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0;padding:0}
.tools a{display:inline-block;padding:7px 12px;border:1px solid var(--line);border-radius:8px;text-decoration:none;color:var(--ink);font-size:14px;font-weight:600}
.tools a.primary{background:var(--ink);color:#fff;border-color:var(--ink)}
main{max-width:920px;margin:0 auto;padding:8px 24px 64px}
h1{font-size:34px;line-height:1.15;margin:8px 0 12px;letter-spacing:-.01em}
h2{font-size:24px;line-height:1.25;margin:44px 0 12px;padding-top:12px;border-top:2px solid var(--ink)}
h3{font-size:17px;margin:26px 0 8px}
p{margin:0 0 12px}
.eyebrow{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ok);margin:24px 0 0}
.verdict{font-size:22px;line-height:1.4;font-weight:600;margin:6px 0 10px}
.verdict.bad{color:var(--bad)}
.verdict.ok{color:var(--ok)}
.sub{color:var(--muted)}
.order{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums;margin:-6px 0 10px}
dl.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:18px 0 0}
dl.facts div{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
dl.facts dt{font-size:13px;color:var(--muted);margin:0}
dl.facts dd{margin:2px 0 0;font-weight:600;overflow-wrap:anywhere}
dl.kv{display:grid;grid-template-columns:minmax(120px,190px) 1fr;gap:6px 14px;margin:0 0 12px}
dl.kv dt{color:var(--muted);font-size:14px}
dl.kv dd{margin:0;overflow-wrap:anywhere}
.toc ol{columns:2;column-gap:28px;padding-left:20px;margin:8px 0 0}
.toc h2{border:0;margin-top:28px;padding:0;font-size:18px}
table{width:100%;border-collapse:collapse;margin:8px 0 14px;font-size:14px}
caption{text-align:left;font-size:13px;color:var(--muted);padding:0 0 6px}
th,td{border-bottom:1px solid var(--line);padding:7px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
thead th{background:var(--soft);font-weight:700}
tbody th{font-weight:600}
td.num{font-variant-numeric:tabular-nums}
table.log td:nth-child(1),table.log th:nth-child(1){width:3.2em;white-space:nowrap}
table.log td:nth-child(2),table.log th:nth-child(2){width:9em;overflow-wrap:normal;word-break:normal}
.claim{display:inline-block;font-weight:700;border-radius:999px;padding:4px 12px;margin:0 0 8px;background:var(--ok-soft);color:var(--ok);border:1px solid #9fd3c0}
.claim.regressed{background:var(--bad-soft);color:var(--bad);border-color:#efb7b0}
.note{font-size:14px;color:var(--muted)}
.label{display:inline-block;font-size:13px;font-weight:700;padding:2px 9px;border-radius:999px;border:1px solid var(--line);background:var(--soft)}
.label.bad{color:var(--bad);border-color:#efb7b0;background:var(--bad-soft)}
.label.ok{color:var(--ok);border-color:#9fd3c0;background:var(--ok-soft)}
.label.warn{color:var(--warn);border-color:#e8c98a;background:var(--warn-soft)}
.honest{border-left:4px solid var(--blue);background:#eef3fd;padding:10px 14px;border-radius:0 8px 8px 0;font-size:14px}
ol.changes{list-style:none;padding:0;margin:14px 0 0}
.change{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:0 0 14px;break-inside:avoid}
.change h3{margin:0 0 6px;font-size:16px}
.change h3 .note{font-weight:400}
.code-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
.code-pair figure{margin:0;min-width:0}
.code-pair figcaption{font-size:13px;font-weight:700;margin:0 0 4px}
/* One code font everywhere. <code> would otherwise fall back to the browser's monospace (Courier). */
code,pre,kbd,samp{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-variant-ligatures:none;font-feature-settings:'liga' 0,'calt' 0}
code{font-size:.92em}
pre code{font-size:inherit}
.common{margin:0 0 14px}
.common p{margin:0 0 6px}
pre{margin:0;font:13px/1.5 'JetBrains Mono',ui-monospace,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--soft)}
pre.before{background:var(--bad-soft);border-color:#efb7b0}
pre.after{background:var(--ok-soft);border-color:#9fd3c0}
pre.perceived{max-height:none;font-size:12.5px}
blockquote{margin:0 0 8px;padding:8px 14px;border-left:4px solid var(--line);background:var(--soft);border-radius:0 8px 8px 0}
.words{list-style:none;padding:0;margin:0}
.ok-text{color:var(--ok);font-weight:700}
.bad-text{color:var(--bad);font-weight:700}
footer{max-width:920px;margin:0 auto;padding:20px 24px 40px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
@media (max-width:640px){h1{font-size:28px}.code-pair{grid-template-columns:1fr}.toc ol{columns:1}dl.kv{grid-template-columns:1fr}main,.top,footer{padding-left:16px;padding-right:16px}}
@page{size:A4;margin:16mm 15mm 18mm}
@media print{
  body{font-size:10.5pt}
  .tools,.skip{display:none}
  .top{padding:0 0 8px}
  main{padding:0}
  h1{font-size:22pt}
  h2{font-size:16pt;margin-top:18pt}
  section.blocker>h2,#method>h2,#steps>h2,#scanner>h2{break-before:page}
  h2,h3{break-after:avoid}
  figure,table,pre,.change,blockquote,dl.facts{break-inside:avoid}
  tr{break-inside:avoid}
  pre{font-size:8.5pt}
  a{color:var(--ink);text-decoration:none}
  .toc ol{columns:2}
}
${ANNOTATE_CSS}`;

const LOGO = '<svg width="40" height="24" viewBox="0 0 40 24" aria-hidden="true" focusable="false"><rect x="1.25" y="1.25" width="37.5" height="21.5" rx="10.75" fill="none" stroke="#0b1b33" stroke-width="2.5"/><rect x="6" y="6" width="28" height="12" rx="6" fill="#05664c"/></svg>';

function page({ title, body, links, print }) {
  const tools = links ? [
    links.pdf && `<li><a class="primary" href="${esc(links.pdf)}">Download PDF</a></li>`,
    links.patch && `<li><a href="${esc(links.patch)}" download>Download fix.patch</a></li>`,
    links.case && links.case !== links.self && `<li><a href="${esc(links.case)}">Case report</a></li>`,
    links.runView && `<li><a href="${esc(links.runView)}">Open the run</a></li>`,
  ].filter(Boolean).join('') : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="AccessiPay owner report: what blocked a simulated customer at checkout, the proof, and the change that fixed it.">
<style>${CSS}</style>
</head>
<body${print ? ' class="print"' : ''}>
<a class="skip" href="#main">Skip to the report</a>
<header class="top">
<div class="brand">${LOGO}<span>AccessiPay</span></div>
${tools ? `<nav class="tools" aria-label="Downloads"><ul>${tools}</ul></nav>` : ''}
</header>
<main id="main">
${body}
</main>
<footer><p>AccessiPay owner report, generated ${esc(date(new Date().toISOString()))}. Every number in it comes from the recorded run data named in it.</p></footer>
</body>
</html>`;
}

function facts(items) {
  return `<dl class="facts">${items.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

function scorecardHtml(sc, id = 'scorecard') {
  const head = `<tr><th scope="col">Measure</th>${sc.columns.map((c) => `<th scope="col">${esc(c.title)}<br><span class="note">run ${esc(c.runId)}</span></th>`).join('')}</tr>`;
  const rows = sc.rows.map((r) => `<tr><th scope="row">${esc(r.label)}</th>${r.values.map((v) => `<td class="num">${esc(v)}</td>`).join('')}</tr>`).join('');
  const claim = sc.claim ? `<p class="claim ${esc(sc.claim.kind)}">${esc(sc.claim.label)}</p><p>${esc(sc.claim.text)}</p>${sc.claim.baseline ? `<p>${esc(sc.claim.baseline)}</p>` : ''}` : '';
  return `<section id="${id}" aria-labelledby="${id}-h"><h2 id="${id}-h">Scorecard</h2>${claim}
<table><caption>Measured from the run events. Counts are for one run per column.</caption><thead>${head}</thead><tbody>${rows}</tbody></table></section>`;
}

function codePair(before, after, n) {
  return `<div class="code-pair">
<figure><figcaption id="b${n}">Before</figcaption><pre class="before"><code>${esc(before)}</code></pre></figure>
<figure><figcaption id="a${n}">After</figcaption><pre class="after"><code>${esc(after)}</code></pre></figure>
</div>`;
}

function wcagHtml(list, lead = '') {
  if (!list?.length) return 'Not mapped';
  return lead + list.map((w) => `may not meet <a href="${esc(w.url)}">${esc(w.sc)} ${esc(w.name)}</a>${w.level ? ` (Level ${esc(w.level)})` : ''}`).join('; ') + '; confirm with manual testing';
}

const same = (list, key) => list.length > 0 && list.every((x) => key(x) === key(list[0]));

function changesHtml(r) {
  if (!r.changes?.length) {
    return `<section id="changes" aria-labelledby="changes-h"><h2 id="changes-h">Changes to make</h2><p>No fix has been made for this run yet. ${r.verdict.blocked ? 'Open the run in the console and press "Propose a fix".' : ''}</p></section>`;
  }
  // What every change shares (the WCAG criterion, the re-run that verified it, the customers) is said
  // once, above the list, as on the console page.
  const wcagOf = (c) => (c.wcag ? wcagList(c.wcag) : r.blockers[0]?.wcag || []);
  const wcagKey = (c) => wcagOf(c).map((w) => w.sc).join(',');
  const verKey = (c) => (c.verifiedBy ? `${c.verifiedBy.runId}|${c.verifiedBy.outcome}|${c.verifiedBy.paypalStatus || ''}` : '');
  const custText = (c) => `Blocked in a run: ${c.personas.observed.map(personaName).join(', ') || 'none'}. Expected, not tested: ${c.personas.expected.map(personaName).join(', ') || 'none'}.`;
  const oneWcag = same(r.changes, wcagKey) && wcagOf(r.changes[0]).length ? wcagOf(r.changes[0]) : null;
  const oneVer = same(r.changes, verKey) ? r.changes[0].verifiedBy : null;
  const oneCust = same(r.changes, custText) ? custText(r.changes[0]) : null;
  const common = `<div class="common">
${oneVer ? `<p>${verifiedText(oneVer)}</p>` : ''}
${oneWcag ? `<p class="note">WCAG 2.2: ${wcagHtml(oneWcag, 'the page as built ')}.</p>` : ''}
${oneCust ? `<p class="note">Customers ${esc(oneCust.replace(/^Blocked/, 'blocked').replace('Expected, not tested', 'Expected to be blocked too, not tested'))}</p>` : ''}
</div>`;
  const items = r.changes.map((c) => {
    const kv = [
      !oneWcag && `<dt>WCAG 2.2</dt><dd>${wcagHtml(wcagOf(c))}</dd>`,
      !oneCust && `<dt>Customers</dt><dd>${esc(custText(c))}</dd>`,
      !oneVer && c.verifiedBy && `<dt>Verified by</dt><dd>${verifiedText(c.verifiedBy)}</dd>`,
    ].filter(Boolean).join('');
    return `<li class="change" aria-labelledby="c${c.n}">
<h3 id="c${c.n}">${c.n}. ${c.element.selector ? `<code>${esc(c.element.selector)}</code>` : 'Script change'} <span class="note">in ${esc(c.file)}${c.line ? `, line ${esc(c.line)}` : ''}</span></h3>
<p>${esc(c.why)}</p>
${kv ? `<dl class="kv">${kv}</dl>` : ''}
${codePair(c.before, c.after, `c${c.n}`)}
</li>`;
  }).join('');
  return `<section id="changes" aria-labelledby="changes-h"><h2 id="changes-h">Changes to make</h2>
${common}
<p class="honest">${esc(r.honesty)} The demo shop's pages are template strings, so each change is shown on the HTML the customer received.${r.changesSource ? ` Source of the code below: ${esc(r.changesSource)}.` : ''}</p>
<ol class="changes">${items}</ol></section>`;
}

function blockerHtml(b, r) {
  const fig = b.figure ? annotatedFigureHtml({ ...b.figure, idPrefix: `b${b.n}`, scannerRecorded: b.figure.scannerRecorded }) : '<p class="note">No screenshot was recorded for this step.</p>';
  const tried = b.tried.length ? `<table><caption>Steps ${esc(b.steps[0])} to ${esc(b.steps.at(-1))}, on this page</caption><thead><tr><th scope="col">Step</th><th scope="col">What it tried</th><th scope="col">What happened</th></tr></thead><tbody>${b.tried.map((t) => `<tr><td class="num">${esc(t.step)}</td><td>${esc(t.action)}${Object.keys(t.args).length ? ` (${esc(args(t.args))})` : ''}</td><td>${esc(t.result || '(no action)')}</td></tr>`).join('')}</tbody></table>` : '';
  const v = b.verification;
  const verification = v
    ? `<p class="${v.outcome === 'purchased' ? 'ok-text' : 'bad-text'}">${verifiedText({ runId: v.runId, outcome: v.outcome, steps: v.steps, paypalStatus: v.payment?.status, paypalMode: v.payment?.mode })}</p>${v.payment ? `<p class="order">PayPal ${esc(v.payment.mode)} order ${esc(v.payment.orderId)}: ${esc(v.payment.status)}${v.payment.amount != null ? `, $${esc(Number(v.payment.amount).toFixed(2))}` : ''}</p>` : ''}`
    : '<p>Not verified yet: no re-run after a fix.</p>';
  return `<section class="blocker" id="blocker-${b.n}" aria-labelledby="blocker-${b.n}-h">
<h2 id="blocker-${b.n}-h">Blocker ${b.n}: ${esc(cleanText(b.title))}</h2>
<p><span class="label bad">${esc(b.impact)}</span> <span class="label ${b.confidence === 'Confirmed in DOM' ? 'ok' : 'warn'}">${esc(b.confidence)}</span></p>
<dl class="kv">
<dt>Customers</dt><dd>Observed blocked in a run: ${esc(b.customers.observed.map(personaName).join(', '))}. Expected, not tested: ${esc(b.customers.expected.map(personaName).join(', ') || 'none')}.</dd>
<dt>WCAG 2.2</dt><dd>${wcagHtml(b.wcag)}</dd>
<dt>Where</dt><dd>${b.where.url ? esc(b.where.url) : `Page <code>${esc(b.where.path || b.where.page)}</code>`}${b.where.selector ? `, element <code>${esc(b.where.selector)}</code>` : ''}</dd>
${b.where.role != null ? `<dt>As the customer got it</dt><dd>Role: ${esc(b.where.role)}; name: ${esc(cleanText(b.where.name))}; ${b.where.focusable ? 'reachable with Tab' : 'not reachable with Tab'}</dd>` : ''}
${b.where.outer ? `<dt>Markup</dt><dd><pre><code>${esc(b.where.outer.replace(/\s*data-ap-culprit="[^"]*"/g, ''))}</code></pre></dd>` : ''}
<dt>Evidence</dt><dd>Run ${esc(r.run.id)}, steps ${esc(b.steps[0])} to ${esc(b.steps.at(-1))}. ${esc(b.metricEvidence)}</dd>
</dl>
${fig}
${b.note && b.culpritSource !== 'fix' ? `<p class="note">${esc(b.note)}</p>` : ''}
<h3>What the customer perceived (step ${esc(b.perceivedStep)})</h3>
<pre class="perceived"><code>${esc(b.perceived)}</code></pre>
<h3>In the customer's own words</h3>
<ul class="words">${b.words.map((w) => `<li><blockquote>${esc(w)}</blockquote></li>`).join('') || '<li>The customer reported nothing on this page.</li>'}</ul>
<h3>What it tried and what happened</h3>
${tried}
<h3>Ready code</h3>
${b.fix ? `<p>${esc(b.fix.summary)}</p>${b.fix.changes.length > 2 ? `<p>The code for each change is under <a href="#changes">Changes to make</a>:</p><ol>${b.fix.changes.map((c) => `<li><a href="#c${c.n}">${esc(c.why)}</a></li>`).join('')}</ol>` : b.fix.changes.map((c) => `<p><strong>${c.n}.</strong> ${esc(c.why)}</p>${codePair(c.before, c.after, `bk${b.n}-${c.n}`)}`).join('')}<p class="note">${esc(r.honesty)}</p>` : '<p>No fix yet.</p>'}
<h3>Verification</h3>
${verification}
<h3>Scanner status</h3>
<p>${esc(b.scanner)}</p>
${b.check.length ? `<h3>How to check it yourself</h3><ol>${b.check.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>` : ''}
</section>`;
}

function scannerHtml(r) {
  const s = r.scanner;
  if (!s.pages.length) return `<section id="scanner" aria-labelledby="scanner-h"><h2 id="scanner-h">Scanner vs reality</h2><p>No scan was recorded for this run.</p></section>`;
  const stuck = r.blockers?.[0]?.where?.page;
  const rows = s.pages.map((p) => `<tr><th scope="row">${esc(p.page || p.url)}</th><td class="num">${esc(p.violations ?? 'not scanned')}</td><td>${esc((p.rules || []).join(', ') || '—')}</td>${r.kind === 'site' ? `<td>${esc(p.frameNote || '')}</td>` : `<td>${p.page && p.page === stuck ? '<span class="bad-text">The customer was blocked here</span>' : ''}</td>`}</tr>`).join('');
  const matched = (r.blockers || []).some((b) => /^Flagged/.test(b.scanner));
  return `<section id="scanner" aria-labelledby="scanner-h"><h2 id="scanner-h">Scanner vs reality</h2>
<p>${s.total === 0
    ? `axe-core ${esc(s.version)} reported no violations${r.kind !== 'site' && r.blockers?.length ? ', so it did not flag the element that blocked the customer' : ''}.`
    : `axe-core ${esc(s.version)} reported ${esc(s.total ?? 'no')} violation${s.total === 1 ? '' : 's'} in total. ${r.kind === 'site' ? '' : r.blockers?.length ? (matched ? 'It flagged the element that blocked the customer.' : 'None of them is the element that blocked the customer.') : ''}`}</p>
<table><caption>axe-core results per page</caption><thead><tr><th scope="col">Page</th><th scope="col">Violations</th><th scope="col">Rules</th><th scope="col">${r.kind === 'site' ? 'Note' : 'What happened there'}</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function methodHtml(r) {
  return `<section id="method" aria-labelledby="method-h"><h2 id="method-h">Method and honest limits</h2>
<h3>How this was tested</h3><ul>${r.method.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
<h3>Limits</h3><ul>${r.limits.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></section>`;
}

function stepsHtml(rows, id, title) {
  return `<section id="${id}" aria-labelledby="${id}-h"><h2 id="${id}-h">${esc(title)}</h2>
<table class="log"><caption>Every decision of the customer model and the browser's answer</caption><thead><tr><th scope="col">Step</th><th scope="col">Page</th><th scope="col">Action</th><th scope="col">Result</th></tr></thead><tbody>
${rows.map((s) => `<tr><td class="num">${esc(s.step)}</td><td>${esc(s.where)}</td><td>${esc(s.action)}${Object.keys(s.args).length ? ` (${esc(args(s.args))})` : ''}</td><td>${s.ok === false ? '<span class="bad-text">Failed:</span> ' : ''}${esc(s.result)}</td></tr>`).join('')}
</tbody></table></section>`;
}

export function reportHtml(r, { print = false } = {}) {
  if (r.kind === 'site') return siteHtml(r, { print });
  const isCase = r.kind === 'case';
  const head = headline(r);
  const toc = [
    ['scorecard', 'Scorecard'],
    ['changes', 'Changes to make'],
    ...r.blockers.map((b) => [`blocker-${b.n}`, `Blocker ${b.n}: ${cleanText(b.short)}`]),
    r.friction.length && ['friction', 'What the customer reported'],
    r.otherFindings.length && ['other', 'Other things the customer reported'],
    ['scanner', 'Scanner vs reality'],
    ['method', 'Method and honest limits'],
    ['steps', 'Step log'],
  ].filter(Boolean);
  const body = `
<section class="cover" aria-labelledby="title">
<p class="eyebrow">Owner report · ${isCase ? 'blocked run, fix and re-run' : 'single run'}</p>
<h1 id="title">${esc(r.title)}: ${esc(customer(r.run.persona))} on the demo shop</h1>
<p class="verdict ${r.verdict.paidAfter || r.run.outcome?.status === 'purchased' ? 'ok' : 'bad'}">${esc(head.text)}</p>
${head.order ? `<p class="order">PayPal ${esc(head.order.mode)} order ${esc(head.order.id)}</p>` : ''}
<p class="sub">${esc(scannerLine(r))}</p>
${facts([
    ['Target', esc(r.target.label)],
    ['Defects switched on', esc(r.target.defects.map((d) => d.short).join(', ') || 'none')],
    ['Customer tested', esc(personaName(r.run.persona))],
    ['Run date', esc(date(r.date))],
    ['Runs', `${esc(r.run.id)}${r.rerun ? ` → re-run ${esc(r.rerun.id)}` : ''}`],
    r.fix && ['Fix', `${esc(r.fix.id)}: ${esc(r.fix.accepted)} change${r.fix.accepted === 1 ? '' : 's'} on the ${esc(r.fix.page)} page`],
  ])}
</section>
<nav class="toc" aria-labelledby="toc-h"><h2 id="toc-h">Contents</h2><ol>${toc.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}</ol></nav>
${scorecardHtml(r.scorecard)}
${changesHtml(r)}
${r.blockers.map((b) => blockerHtml(b, r)).join('')}
${r.friction.length ? `<section id="friction" aria-labelledby="friction-h"><h2 id="friction-h">What the customer reported</h2><p>The customer paid; these are the difficulties it described on the way. Agent-reported, not yet confirmed in the page code.</p><ol>${r.friction.map((f) => `<li><strong>${esc(f.page)}</strong>: ${esc(f.problem)}</li>`).join('')}</ol></section>` : ''}
${r.otherFindings.length ? `<section id="other" aria-labelledby="other-h"><h2 id="other-h">Other things the customer reported</h2><p>Agent-reported, not yet confirmed in the page code. They did not stop the purchase.</p><ol>${r.otherFindings.map((f) => `<li><strong>${esc(f.page)}</strong>: ${esc(f.problem)}</li>`).join('')}</ol></section>` : ''}
${scannerHtml(r)}
${methodHtml(r)}
${stepsHtml(r.steps, 'steps', `Step log: run ${r.run.id}${r.rerun ? ' (before the fix)' : ''}`)}
${r.rerunSteps ? stepsHtml(r.rerunSteps, 'steps-after', `Step log: re-run ${r.rerun.id} (after the fix)`) : ''}`;
  return page({ title: `${r.title}, run ${r.id} | AccessiPay`, body, links: { ...r.links, self: `/report/${r.kind}/${r.id}` }, print });
}

function siteHtml(r, { print }) {
  const toc = [['scorecard', 'Scorecard'], ['findings', 'Findings and suggested changes'], ['scanner', 'Scanner vs reality'], ['method', 'Method and honest limits'], ['steps', 'Step log']];
  const findings = r.findings.map((f) => `<article class="finding" id="finding-${f.n}" aria-labelledby="finding-${f.n}-h">
<h3 id="finding-${f.n}-h">${f.n}. ${esc(f.page)}</h3>
<p><span class="label ${f.notDefect ? '' : 'warn'}">${f.notDefect ? 'Not an accessibility defect' : esc(f.confidence)}</span></p>
<dl class="kv"><dt>Where</dt><dd>${esc(f.url || f.page)}${f.step ? `, step ${esc(f.step)}` : ''}</dd>
<dt>In the customer's words</dt><dd><blockquote>${esc(f.problem)}</blockquote></dd>
<dt>Scanner</dt><dd>${esc(f.scanner)}</dd></dl>
${f.figure ? annotatedFigureHtml({ ...f.figure, idPrefix: `f${f.n}`, stuckLabel: 'Where the customer had the problem', scannerRecorded: f.figure.scannerRecorded }) : ''}
<h4>Suggested change (not verified on your site)</h4>
<ul>${f.suggestion.map((s) => `<li>${esc(s.text)}${s.wcag.length ? ` WCAG 2.2: ${wcagHtml(s.wcag)}.` : ''}</li>`).join('')}</ul>
<details${print ? ' open' : ''}><summary>What the customer perceived at step ${esc(f.step)}</summary><pre class="perceived"><code>${esc(f.perceived)}</code></pre></details>
</article>`).join('');
  const body = `
<section class="cover" aria-labelledby="title">
<p class="eyebrow">Owner report · real site</p>
<h1 id="title">${esc(r.title)}: ${esc(r.target.host)}</h1>
<p class="verdict ${r.verdict.blocked ? 'bad' : 'ok'}">${esc(r.verdict.headline)}</p>
<p class="sub">${esc(scannerLine(r))}</p>
${facts([
    ['Site', `<a href="${esc(r.target.url)}">${esc(r.target.host)}</a>`],
    ['Customer tested', esc(personaName(r.run.persona))],
    ['Run date', esc(date(r.date))],
    ['Run', esc(r.run.id)],
    ['Findings', esc(r.findings.length)],
  ])}
<p class="honest">Nothing was paid and no order was placed. Findings are reported by the AI customer; suggested changes have not been verified on this site.</p>
</section>
<nav class="toc" aria-labelledby="toc-h"><h2 id="toc-h">Contents</h2><ol>${toc.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}</ol></nav>
${scorecardHtml(r.scorecard)}
<section id="findings" aria-labelledby="findings-h"><h2 id="findings-h">Findings and suggested changes</h2>${findings || '<p>The customer reported nothing.</p>'}</section>
${scannerHtml(r)}
${methodHtml(r)}
${stepsHtml(r.steps, 'steps', `Step log: run ${r.run.id}`)}`;
  return page({ title: `${r.title}, ${r.target.host} | AccessiPay`, body, links: r.links, print });
}

export function errorHtml(status, message) {
  return page({ title: 'Report not available | AccessiPay', body: `<h1>Report not available</h1><p>${esc(message)}</p><p><a href="/#/runs">All runs</a></p>`, links: null });
}
