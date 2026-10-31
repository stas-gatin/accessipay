import React, { useEffect, useState } from 'react';
import { api, OUTCOME, shortDate } from './api.js';

// One analysis per site: every customer type that tried to buy there, as one report.

const PERSONAS = [
  ['screenreader', 'Screen reader customer', 'Hears the page, moves with the keyboard.'],
  ['keyboard', 'Keyboard-only customer', 'Sees the page, no mouse.'],
  ['agent', 'AI shopping agent', 'Reads the accessibility tree, acts by name.'],
];
const label = (p) => PERSONAS.find((x) => x[0] === p)?.[1] || p;
const SHORT = { screenreader: 'Screen reader', keyboard: 'Keyboard', agent: 'AI agent' };
const outcomeWord = (o) => (o === 'reached-payment' ? 'Reached payment' : o === 'purchased' ? 'Paid' : o === 'not-testable' ? 'Not counted' : o === 'blocked' ? 'Stopped' : o ? OUTCOME[o]?.label || o : 'Running');
const tone = (o) => (o === 'reached-payment' || o === 'purchased' ? 'ok' : o === 'not-testable' || !o ? 'muted' : 'bad');
const siteHref = (key) => `#/sites/${encodeURIComponent(key)}`;

function Pill({ outcome }) {
  return <span className={`pill ${tone(outcome)}`}>{outcomeWord(outcome)}</span>;
}

function Verdict({ s }) {
  if (!s.tested && s.notTestable) return <>Not testable: the site turned our browser away</>;
  if (!s.tested) return <>Running</>;
  return <>{s.reached} of {s.tested} customer type{s.tested === 1 ? '' : 's'} reached the payment step</>;
}

const DOT = { ok: 'reached', bad: 'stopped', muted: 'not counted' };
function Dots({ s }) {
  return (
    <span className="res-dots" aria-hidden="true">
      {PERSONAS.map(([p]) => {
        const c = s.customers[p];
        return <i key={p} className={c ? tone(c.outcome) : 'none'} title={`${label(p)}: ${c ? outcomeWord(c.outcome) : 'not run'}`} />;
      })}
    </span>
  );
}
const shortVerdict = (s) => (!s.tested ? (s.notTestable ? 'not testable' : 'running') : `${s.reached}/${s.tested} reached payment`);

// Every site in one place: pick one on the left, its whole analysis shows on the right.
export default function Results({ siteKey }) {
  const [list, setList] = useState(null);
  useEffect(() => { api('/api/sites').then(setList).catch(() => setList([])); }, []);
  const platforms = (list || []).filter((s) => s.kind === 'platform');
  const retailers = (list || []).filter((s) => s.kind === 'retailer');
  const selected = siteKey || platforms[0]?.key || retailers[0]?.key || null;
  const Group = ({ title, rows }) => (
    <>
      <h2 className="res-group">{title}</h2>
      <ul>
        {rows.map((s) => (
          <li key={s.key}>
            <a href={siteHref(s.key)} aria-current={s.key === selected ? 'page' : undefined}>
              <span className="res-name">{s.key}</span>
              <span className="res-sub"><Dots s={s} /><span>{shortVerdict(s)}</span></span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
  return (
    <div className="page results">
      <p className="eyebrow">Results</p>
      <h1>Every site we tested</h1>
      <p className="lead">One analysis per site: all three customers together. Pick a site to see what they met.</p>
      <div className="res-grid">
        <nav className="res-list" aria-label="Sites">
          <label className="res-select">
            <span className="sr-only">Site</span>
            <select value={selected || ''} onChange={(e) => { location.hash = siteHref(e.target.value); }}>
              <optgroup label="Open-source platform demos">{platforms.map((s) => <option key={s.key} value={s.key}>{s.key} · {shortVerdict(s)}</option>)}</optgroup>
              <optgroup label="Large retailers, names withheld">{retailers.map((s) => <option key={s.key} value={s.key}>{s.key} · {shortVerdict(s)}</option>)}</optgroup>
            </select>
          </label>
          <div className="res-groups">
            {!list && <p className="note">Loading…</p>}
            {platforms.length > 0 && <Group title="Open-source platform demos" rows={platforms} />}
            {retailers.length > 0 && <Group title="Large retailers, names withheld" rows={retailers} />}
          </div>
          <p className="res-legend note" aria-hidden="true"><i className="ok" /> reached payment <i className="bad" /> stopped <i className="muted" /> not counted · dots: screen reader, keyboard, AI agent</p>
          <ul className="res-more">
            <li><a href="#/defects">Our demo shop: the 13 defects and their fixes</a></li>
            <li><a href="#/runs">Every single run</a></li>
            <li><a href="#/honesty">What we do not claim</a></li>
          </ul>
        </nav>
        <div className="res-detail">
          {selected ? <SiteAnalysis key={selected} siteKey={selected} /> : list && <p className="note">No site tested yet.</p>}
        </div>
      </div>
    </div>
  );
}

function SiteAnalysis({ siteKey }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    let t;
    const load = () => api(`/api/sites/${encodeURIComponent(siteKey)}`)
      .then((r) => { if (!live) return; setS(r); if (r.running) t = setTimeout(load, 5000); })
      .catch((e) => live && setError(e.message));
    load();
    return () => { live = false; clearTimeout(t); };
  }, [siteKey]);
  if (error) return <p className="note">{error}</p>;
  if (!s) return <p className="note">Loading the analysis…</p>;

  return (
    <article className="site-report" aria-labelledby="site-name">
      <p className="eyebrow">{s.kind === 'retailer' ? 'Large retailer, name withheld' : 'Open-source platform demo'}</p>
      <h2 className="sr-name" id="site-name">{s.key}</h2>
      <p className="lead">
        {s.url && !s.anonymized ? <a href={s.url} rel="noreferrer noopener" target="_blank">{s.url}</a> : 'Recorded without the name, the address or screenshots.'}
        {' '}Last run {shortDate(s.lastRun)}.{s.running ? ` ${s.running} run${s.running === 1 ? '' : 's'} still going; this page updates by itself.` : ''}
      </p>

      <section className="card sr-verdict" aria-labelledby="sv">
        <p className="sr-verdict-n" id="sv"><Verdict s={s} /></p>
        <div className="sr-tiles">
          {s.customers.map((c) => (
            <a key={c.persona} className={`sr-tile ${tone(c.run?.outcome?.status)}`} href={c.run ? `#/runs/${c.run.id}` : undefined} aria-disabled={!c.run}>
              <span className="sr-tile-who">{label(c.persona)}</span>
              {c.run ? <Pill outcome={c.run.status === 'running' ? null : c.run.outcome?.status} /> : <span className="note">not run yet</span>}
              {c.metrics && (
                <span className="sr-tile-nums">
                  <span><b>{c.metrics.steps}</b> steps</span>
                  {c.persona !== 'agent' && <span><b>{c.metrics.keys}</b> keys</span>}
                  {c.metrics.klmSeconds != null && <span>about <b>{c.metrics.klmSeconds}</b> s for a person</span>}
                  <span><b>{c.findings.length}</b> problems</span>
                </span>
              )}
              {c.run?.reason && <span className="sr-tile-why">“{c.run.reason}”</span>}
              {c.run && <span className="sr-tile-open">Open this run →</span>}
            </a>
          ))}
        </div>
        <p className="note sr-totals">{s.findings} problems reported in total{s.scanner ? ` · axe-core: up to ${s.scanner.violations} rule violations on ${s.scanner.pages} pages` : ''}.</p>
      </section>

      {s.themes.length > 0 && (
        <section className="card" aria-labelledby="st" style={{ marginTop: 16 }}>
          <h3 className="section-title" id="st">Problems across customers</h3>
          <ul className="sr-themes">
            {s.themes.map((t) => (
              <li key={t.theme}>
                <div className="sr-theme-head">
                  <b>{t.theme}</b>
                  <span className="note">{t.count} report{t.count === 1 ? '' : 's'} · met by {t.personas.map(label).join(', ')}</span>
                </div>
                <ul className="sr-examples">
                  {t.examples.map((f, i) => <li key={i}><a className="rv-step-link" href={`#/runs/${f.runId}`}>{SHORT[f.persona]}{f.step != null ? `, step ${f.step}` : ''}</a> {f.problem}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="sc" style={{ marginTop: 16 }}>
        <h3 className="section-title" id="sc">Each customer</h3>
        <div className="sr-cols">
          {s.customers.map((c) => (
            <article key={c.persona} className="card">
              <h4>{label(c.persona)}</h4>
              <p className="note">{PERSONAS.find((x) => x[0] === c.persona)[2]}</p>
              {!c.run ? <p className="note">Not run on this site yet.</p> : (
                <>
                  <p><Pill outcome={c.run.status === 'running' ? null : c.run.outcome?.status} /> {c.run.outcome?.status === 'not-testable' ? c.run.outcome.reason : c.metrics?.furthestStage ? `Furthest: ${c.metrics.furthestStage}` : ''}</p>
                  {c.findings.length ? (
                    <ol className="findings">
                      {c.findings.map((f, i) => (
                        <li key={i}>
                          <a className="rv-step-link" href={`#/runs/${c.run.id}`}>{f.step != null ? `Step ${f.step}` : 'Run'}</a>
                          <span><b>{f.element?.name ? `${f.element.role || 'element'} “${f.element.name}”` : f.page}</b>: {f.problem}</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="note">{c.run.status === 'running' ? 'Reported at the end of the run.' : 'No problems reported.'}</p>}
                  {c.earlier.length > 0 && <p className="note">Earlier runs: {c.earlier.map((e, i) => <React.Fragment key={e.id}>{i ? ', ' : ''}<a href={`#/runs/${e.id}`}>{e.id.slice(-6)}</a> ({outcomeWord(e.outcome)})</React.Fragment>)}</p>}
                </>
              )}
            </article>
          ))}
        </div>
      </section>

      <div className="grid-2" style={{ marginTop: 16 }}>
        {s.scanner && (
          <section className="card" aria-labelledby="ss">
            <h3 className="section-title" id="ss">What the scanner says</h3>
            <p><b>{s.scanner.violations}</b> axe-core rule violations on up to {s.scanner.pages} pages, in the state each customer saw them.</p>
            <p className="note">Rules: {s.scanner.rules.join(', ') || 'none'}. A scanner counts rules; the customers above show which problems actually slowed or stopped a purchase.</p>
          </section>
        )}
        {s.agentAccess && (
          <section className="card" aria-labelledby="sa">
            <h3 className="section-title" id="sa">Can AI assistants shop here?</h3>
            <p><b>{s.agentAccess.verdict === 'open' ? 'Open' : s.agentAccess.verdict === 'restricted' ? 'Partly closed' : 'Closed to automated browsers'}</b> <span className="note">(checked {shortDate(s.agentAccess.checkedAt)})</span></p>
            <ul className="note">{s.agentAccess.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </section>
        )}
      </div>
    </article>
  );
}
