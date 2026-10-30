import React, { useEffect, useRef, useState } from 'react';
import { api, OUTCOME } from './api.js';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Counts up to the value once, unless the reader asked for reduced motion.
function CountUp({ value, suffix = '' }) {
  const [shown, setShown] = useState(reduced() ? value : 0);
  useEffect(() => {
    if (value == null || reduced()) { setShown(value); return; }
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / 900);
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown == null ? '—' : shown}{suffix}</>;
}

// Bars grow from zero after the first paint.
function useGrown() {
  const [grown, setGrown] = useState(reduced());
  useEffect(() => { const t = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(t); }, []);
  return grown;
}

function DataTable({ caption, head, rows }) {
  return (
    <details className="an-data">
      <summary>Show the data</summary>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
      </table>
    </details>
  );
}

function Tip({ text, children }) {
  const [show, setShow] = useState(false);
  return (
    <span className="an-tipwrap" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onFocus={() => setShow(true)} onBlur={() => setShow(false)}>
      {children}
      {show && <span className="an-tip" role="tooltip">{text}</span>}
    </span>
  );
}

function PersonaChart({ data, meta }) {
  const grown = useGrown();
  const max = Math.max(...data.map((d) => d.runs), 1);
  return (
    <figure className="an-card">
      <figcaption><h2>Outcome by customer</h2><p>Every finished run, demo shop and real sites.</p></figcaption>
      <div className="an-legend" aria-hidden="true">
        <span><i className="sw ok" />Paid or reached payment</span><span><i className="sw bad" />Blocked</span>
      </div>
      <div className="an-rows">
        {data.map((d) => (
          <div className="an-row" key={d.persona}>
            <span className="an-label">{meta.personas[d.persona]?.label}</span>
            <span className="an-track" style={{ width: `${(d.runs / max) * 100}%` }}>
              <Tip text={`${d.success} of ${d.runs} runs succeeded`}>
                <span role="img" tabIndex={0} className="an-seg ok" style={{ width: grown ? `${(d.success / d.runs) * 100}%` : 0 }} aria-label={`${meta.personas[d.persona]?.label}: ${d.success} succeeded`} />
              </Tip>
              <Tip text={`${d.blocked} of ${d.runs} runs were blocked`}>
                <span role="img" tabIndex={0} className="an-seg bad" style={{ width: grown ? `${(d.blocked / d.runs) * 100}%` : 0 }} aria-label={`${meta.personas[d.persona]?.label}: ${d.blocked} blocked`} />
              </Tip>
            </span>
            <span className="an-val">{d.success} / {d.runs}</span>
          </div>
        ))}
      </div>
      <DataTable caption="Outcome by customer" head={['Customer', 'Runs', 'Succeeded', 'Blocked', 'Median steps to succeed']}
        rows={data.map((d) => [meta.personas[d.persona]?.label, d.runs, d.success, d.blocked, d.medianSteps ?? '—'])} />
    </figure>
  );
}

function Funnel({ data }) {
  const grown = useGrown();
  const top = data[0]?.runs || 1;
  return (
    <figure className="an-card">
      <figcaption><h2>Where customers stop</h2><p>Demo shop runs: how many reached each step of the checkout.</p></figcaption>
      <ol className="an-funnel">
        {data.map((d, i) => {
          const lost = i > 0 ? data[i - 1].runs - d.runs : 0;
          return (
            <li key={d.stage}>
              <span className="an-label">{d.stage}</span>
              <span className="an-track full">
                <Tip text={`${d.runs} of ${top} runs reached ${d.stage.toLowerCase()} (${Math.round((d.runs / top) * 100)}%)`}>
                  <span role="img" tabIndex={0} className={`an-bar ${d.stage === 'Paid' ? 'ok' : ''}`} style={{ width: grown ? `${(d.runs / top) * 100}%` : 0, transitionDelay: `${i * 90}ms` }} aria-label={`${d.stage}: ${d.runs} runs`} />
                </Tip>
              </span>
              <span className="an-val">{d.runs}{lost > 0 && <em className="an-lost"> −{lost}</em>}</span>
            </li>
          );
        })}
      </ol>
      <DataTable caption="Where customers stop" head={['Step', 'Runs that reached it', 'Share of all runs']} rows={data.map((d) => [d.stage, d.runs, `${Math.round((d.runs / top) * 100)}%`])} />
    </figure>
  );
}

function Matrix({ m }) {
  const cell = (label, value, cls, note) => (
    <div className={`an-cell ${cls}`}>
      <span className="an-cell-n"><CountUp value={value} /></span>
      <span className="an-cell-l">{label}</span>
      {note && <span className="an-cell-note">{note}</span>}
    </div>
  );
  return (
    <figure className="an-card">
      <figcaption><h2>Scanner versus reality</h2><p>Demo shop runs, by what axe-core said about the same pages.</p></figcaption>
      <div className="an-matrix" role="group" aria-label="Scanner verdict against the real outcome">
        <span />
        <span className="an-axis">Customer paid</span>
        <span className="an-axis">Customer blocked</span>
        <span className="an-axis side">Scanner: clean</span>
        {cell('clean and paid', m.cleanBought, 'neutral')}
        {cell('clean, yet blocked', m.cleanBlocked, 'alert', 'The scanner said yes. The customer could not pay.')}
        <span className="an-axis side">Scanner: issues</span>
        {cell('flagged and paid', m.flaggedBought, 'neutral')}
        {cell('flagged and blocked', m.flaggedBlocked, 'neutral')}
      </div>
    </figure>
  );
}

function Themes({ data }) {
  const grown = useGrown();
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const max = Math.max(...sorted.map((d) => d.count), 1);
  return (
    <figure className="an-card">
      <figcaption><h2>What gets in the way</h2><p>Problems the customers reported, grouped by theme. One report can fall in two themes.</p></figcaption>
      <div className="an-rows">
        {sorted.map((d, i) => (
          <div className="an-row" key={d.theme}>
            <span className="an-label wide">{d.theme}</span>
            <span className="an-track full">
              <Tip text={`${d.count} reports`}>
                <span role="img" tabIndex={0} className="an-bar" style={{ width: grown ? `${(d.count / max) * 100}%` : 0, transitionDelay: `${i * 80}ms` }} aria-label={`${d.theme}: ${d.count} reports`} />
              </Tip>
            </span>
            <span className="an-val">{d.count}</span>
          </div>
        ))}
      </div>
      <DataTable caption="What gets in the way" head={['Theme', 'Reports']} rows={sorted.map((d) => [d.theme, d.count])} />
    </figure>
  );
}

function Sites({ data }) {
  if (!data.length) return null;
  return (
    <section className="an-card an-span" aria-labelledby="an-sites">
      <h2 id="an-sites">Real sites</h2>
      <p className="an-sub">Public demo stores of real e-commerce platforms. The customer goes as far as the payment step and stops; nothing is paid. axe-core scans every page the customer saw, in that state.</p>
      <div className="an-sites">
        {data.map((s) => (
          <a key={s.id} className="an-site" href={`#/runs/${s.id}`}>
            <span className="an-site-host">{s.host}</span>
            <span className={`pill ${OUTCOME[s.outcome]?.tone || 'muted'}`}>{s.outcome === 'reached-payment' ? 'Reached payment' : OUTCOME[s.outcome]?.label || s.outcome}</span>
            <span className="an-site-stats">
              <span><b>{s.violations ?? '—'}</b> axe-core issues on {s.pages} pages</span>
              <span><b>{s.findings}</b> problems the agent reported</span>
              <span><b>{s.steps}</b> steps</span>
            </span>
            <span className="an-site-rules">{s.rules.slice(0, 5).join(' · ')}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

export default function Analytics({ meta }) {
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/api/analytics').then(setA).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="page"><p className="empty" role="alert">{error}</p></div>;
  if (!a) return <div className="page"><p className="empty">Loading…</p></div>;
  const t = a.totals;
  return (
    <div className="page an">
      <p className="eyebrow">Analytics</p>
      <h1>What the runs show</h1>
      <p className="lead">Every number here is computed from finished runs on this server: the demo shop with real PayPal sandbox payments, and public demo stores of real platforms.</p>

      <div className="an-kpis">
        <div className="an-kpi"><span className="an-kpi-n"><CountUp value={t.runs} /></span><span className="an-kpi-l">finished runs</span></div>
        <div className="an-kpi"><span className="an-kpi-n ok"><CountUp value={t.paid} /></span><span className="an-kpi-l">paid orders in the demo shop ({t.sandboxOrders} in the PayPal sandbox)</span></div>
        <div className="an-kpi alert"><span className="an-kpi-n bad"><CountUp value={t.blockedWhileClean} /></span><span className="an-kpi-l">customers blocked while the scanner said clean</span></div>
        <div className="an-kpi"><span className="an-kpi-n"><CountUp value={t.medianStepsToBuy} /></span><span className="an-kpi-l">median steps to a paid order</span></div>
        <div className="an-kpi"><span className="an-kpi-n"><CountUp value={t.sites} /></span><span className="an-kpi-l">real sites tested</span></div>
      </div>

      <div className="an-grid">
        <Matrix m={a.matrix} />
        <Funnel data={a.funnel} />
        <PersonaChart data={a.personas} meta={meta} />
        <Themes data={a.themes} />
        <Sites data={a.sites} />
      </div>
    </div>
  );
}
