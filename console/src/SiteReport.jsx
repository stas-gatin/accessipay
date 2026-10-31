import React, { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { gridTheme, useTheme } from './theme.js';
import { api, OUTCOME, shortDate } from './api.js';
import CheckBadge, { CheckLine } from './CheckBadge.jsx';

// One analysis per site: every customer type that tried to buy there, as one report.

const PERSONAS = [
  ['screenreader', 'Screen reader customer', 'Hears the page, moves with the keyboard.'],
  ['keyboard', 'Keyboard-only customer', 'Sees the page, no mouse.'],
  ['agent', 'AI shopping agent', 'Reads the accessibility tree, acts by name.'],
];
const label = (p) => PERSONAS.find((x) => x[0] === p)?.[1] || p;
const SHORT = { screenreader: 'Screen reader', keyboard: 'Keyboard', agent: 'AI agent' };
const outcomeWord = (o) => (o === 'reached-payment' ? 'Reached payment' : o === 'purchased' ? 'Paid' : o === 'not-testable' ? 'Turned away' : o === 'error' ? 'Not counted' : o === 'blocked' ? 'Stopped' : o ? OUTCOME[o]?.label || o : 'Running');
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

const cellWord = (c) => (!c ? 'Not run' : c.status === 'running' ? 'Testing now' : outcomeWord(c.outcome));

// One cell per customer: the outcome as a coloured word, then the steps it took.
function CustomerCell({ value, node }) {
  if (node?.group) return null;
  const c = value;
  if (!c) return <span className="res-cell none">Not run</span>;
  const t = c.status === 'running' ? 'run' : tone(c.outcome);
  return (
    <span className={`res-cell ${t}`}>
      <i aria-hidden="true" />
      <span className="res-cell-t">
        <b>{cellWord(c)}</b>
        {c.status !== 'running' && !['not-testable', 'error'].includes(c.outcome) && c.steps != null && <span>{c.steps} steps</span>}
      </span>
    </span>
  );
}

const groupOf = (s) => (s.running ? 'Testing now' : s.notTestable ? 'Turned away' : 'Tested');

// Every shop in one table (AG Grid): click a row and its whole analysis opens below.
export default function Results({ siteKey }) {
  const t = useTheme();
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
  const [list, setList] = useState(null);
  useEffect(() => {
    let live = true;
    let timer;
    const load = () => api('/api/sites').then((l) => { if (!live) return; setList(l); if (l.some((s) => s.running)) timer = setTimeout(load, 8000); }).catch(() => live && setList([]));
    load();
    return () => { live = false; clearTimeout(timer); };
  }, []);
  const all = list || [];
  const tested = all.filter((s) => s.tested && !s.running);
  const testing = all.filter((s) => s.running);
  const away = all.filter((s) => s.notTestable && !s.running);
  const selected = siteKey || tested[0]?.key || testing[0]?.key || away[0]?.key || null;
  const runsTested = tested.reduce((n, s) => n + s.tested, 0);
  const runsReached = tested.reduce((n, s) => n + s.reached, 0);

  const rows = useMemo(() => all.map((s) => ({
    key: s.key, group: groupOf(s), order: s.running ? 1 : s.notTestable ? 2 : 0,
    verdict: s.running ? 'Testing now' : s.notTestable ? 'Turned away' : `${s.reached} of ${s.tested} reached payment`,
    reached: s.reached, tested: s.tested, problems: s.notTestable ? null : s.problems,
    screenreader: s.customers.screenreader, keyboard: s.customers.keyboard, agent: s.customers.agent,
    lastRun: s.lastRun,
  })).sort((a, b) => a.order - b.order || b.reached - a.reached || a.key.localeCompare(b.key, 'en', { numeric: true })), [list]);

  const custCol = (field, headerName) => ({
    field, headerName, flex: 1, minWidth: 225, hide: narrow, cellRenderer: CustomerCell, sortable: false,
    filter: 'agSetColumnFilter', filterValueGetter: (p) => cellWord(p.data?.[field]),
  });
  const cols = [
    { field: 'group', headerName: 'Group', rowGroup: true, hide: true },
    custCol('screenreader', 'Screen reader'),
    custCol('keyboard', 'Keyboard only'),
    custCol('agent', 'AI agent'),
    { field: 'verdict', headerName: 'Result', minWidth: 150, flex: 1, hide: !narrow, wrapText: true, autoHeight: true, cellClass: 'wrap-cell', valueFormatter: (p) => (p.node?.group ? '' : p.value) },
    { field: 'problems', headerName: 'Problems', width: 116, hide: narrow, type: 'numericColumn', valueFormatter: (p) => (p.node?.group ? '' : p.value == null ? '—' : p.value) },
    { field: 'lastRun', headerName: 'Tested', width: 158, hide: narrow, valueFormatter: (p) => (p.value ? shortDate(p.value) : '') },
  ];

  return (
    <div className="page results">
      <p className="eyebrow">Results</p>
      <h1>Real shops, three customers each</h1>
      <p className="lead">Every shop is tested by a screen reader user, a keyboard-only user and an AI shopping agent, in one visit. Nobody pays on a real shop: a customer passes when it reaches the payment step. Large retailers are shown without their names.</p>
      {list && (
        <ul className="res-stats" aria-label="Summary">
          <li><b>{tested.length}</b><span>shops tested by all three customers</span></li>
          <li><b>{runsTested ? `${runsReached} of ${runsTested}` : '—'}</b><span>customer runs reached the payment step</span></li>
          <li><b>{away.length}</b><span>shops turned our browser away</span></li>
          {testing.length > 0 && <li><b>{testing.length}</b><span>being tested right now</span></li>}
        </ul>
      )}
      <div className="grid-box res-table">
        {list === null ? <p className="empty">Loading…</p> : !all.length ? <p className="empty">No shop tested yet. <a href="#/test">Run a test</a> or <a href="#/own-site">connect your site</a>.</p> : (
          <AgGridReact
            theme={gridTheme(t)}
            rowData={rows}
            columnDefs={cols}
            defaultColDef={{ resizable: true, suppressHeaderMenuButton: true, sortable: true }}
            autoGroupColumnDef={{ headerName: 'Shop', field: 'key', minWidth: narrow ? 170 : 230, flex: 1.1, cellClass: 'res-shop-cell', cellRendererParams: { suppressCount: false } }}
            groupDefaultExpanded={1}
            domLayout="autoHeight"
            rowHeight={narrow ? 48 : 58}
            getRowId={(p) => p.data.key}
            rowClassRules={{ 'res-row-on': (p) => p.data?.key === selected }}
            onRowClicked={(e) => e.data && (location.hash = siteHref(e.data.key))}
          />
        )}
      </div>
      <p className="note">Click a shop to open its whole analysis below. Shops behind bot protection are listed too: AccessiPay never gets past it, and an AI shopping agent may meet the same wall. Their owners can <a href="#/own-site">let the test in</a>. Retailer letters follow the order the shops were added; a missing letter is a shop still waiting for its test.</p>
      <div className="res-detail" id="analysis">
        {selected && <SiteAnalysis key={selected} siteKey={selected} />}
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

  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const head = (
    <>
      <p className="eyebrow">{s.anonymized ? 'Large retailer, name withheld' : 'Real shop'}</p>
      <h2 className="sr-name" id="site-name">{s.key}</h2>
      <p className="lead">
        {s.url && !s.anonymized ? <a href={s.url} rel="noreferrer noopener" target="_blank">{s.url}</a> : 'Recorded without the name, the address or screenshots.'}
        {' '}Tested {shortDate(s.lastRun)}.{s.running ? ` ${plural(s.running, 'customer')} still shopping; this page updates by itself.` : ''}
      </p>
    </>
  );

  // A shop that turned the browser away: nothing was tested, so there is nothing else to show.
  if (s.notTestable && !s.tested && !s.running) {
    return (
      <article className="site-report" aria-labelledby="site-name">
        {head}
        <section className="card sr-away">
          <p className="sr-verdict-n">Not tested: the shop turned our browser away</p>
          <p>{s.reason || 'Bot protection stopped an automated browser before the first step.'} No customer got to shop, so no problem is reported. AccessiPay never tries to get past bot protection; an AI shopping agent that shops in a browser is likely to meet the same wall.</p>
          <p className="note">If this is your shop, <a href="#/own-site">connect it</a>: one allow rule lets the test in while the protection stays on for everyone else.</p>
        </section>
      </article>
    );
  }

  return (
    <article className="site-report" aria-labelledby="site-name">
      {head}
      <section className="card sr-verdict" aria-labelledby="sv">
        <p className="sr-verdict-n" id="sv"><Verdict s={s} /></p>
        <p className="sr-totals">{plural(s.findings, 'problem')} reported by the customers{s.scanner ? `. The scanner (axe-core) counted ${plural(s.scanner.violations, 'rule violation')} on ${plural(s.scanner.pages, 'page')}` : ''}.</p>
        {s.checks?.total > 0 && (
          <p className="sr-checks">
            <b>Checked without AI:</b> {s.checks.confirmed} of {s.checks.checked} findings that can be checked automatically are confirmed by the record of the run (what the customer perceived at that step, where focus went, axe-core){s.checks.notConfirmed ? `; ${s.checks.notConfirmed} not confirmed` : ''}. {s.checks.manual} need a person to judge from the replay.
          </p>
        )}
      </section>

      {s.themes.length > 0 && (
        <section className="card" aria-labelledby="st" style={{ marginTop: 16 }}>
          <h3 className="section-title" id="st">Problems across customers</h3>
          <ul className="sr-themes">
            {s.themes.map((t) => (
              <li key={t.theme}>
                <div className="sr-theme-head">
                  <b>{t.theme}</b>
                  <span className="note">{plural(t.count, 'report')} · met by {t.personas.map(label).join(', ')}</span>
                </div>
                <ul className="sr-examples">
                  {t.examples.map((f, i) => <li key={i}><a className="rv-step-link" href={`#/runs/${f.runId}`}>{SHORT[f.persona]}{f.step != null ? `, step ${f.step}` : ''}</a> <span>{f.problem}</span></li>)}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="sc" style={{ marginTop: 24 }}>
        <h3 className="section-title" id="sc">Each customer</h3>
        <div className="sr-cols">
          {s.customers.map((c) => (
            <article key={c.persona} className={`card sr-col ${tone(c.run?.status === 'running' ? null : c.run?.outcome?.status)}`}>
              <h4>{label(c.persona)}</h4>
              {!c.run ? <p className="note">Not run on this site yet.</p> : (
                <>
                  <div className="sr-col-head">
                    <Pill outcome={c.run.status === 'running' ? null : c.run.outcome?.status} />
                    {c.metrics && <span className="sr-col-nums">{c.metrics.steps} steps{c.persona !== 'agent' ? ` · ${c.metrics.keys} keys` : ''}{c.metrics.furthestStage ? ` · got to ${c.metrics.furthestStage}` : ''}</span>}
                  </div>
                  {['not-testable', 'error'].includes(c.run.outcome?.status) && <p className="note">{c.run.outcome.reason}</p>}
                  {c.run.reason && !['not-testable', 'error'].includes(c.run.outcome?.status) && <p className="sr-col-why">“{c.run.reason}”</p>}
                  {c.findings.length ? (
                    <ol className="findings">
                      {[...c.findings].sort((a, b) => (a.step ?? 1e9) - (b.step ?? 1e9)).map((f, i) => (
                        <li key={i}>
                          <a className="rv-step-link" href={`#/runs/${c.run.id}`}>{f.step != null ? `Step ${f.step}` : 'Run'}</a>
                          <span className="sr-finding"><b className="sr-finding-what">{f.element?.name ? `${f.element.role || 'element'} “${f.element.name}”` : f.page}</b><span>{f.problem}</span><span className="sr-finding-check"><CheckBadge check={f.check} /></span><CheckLine check={f.check} /></span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="note">{c.run.status === 'running' ? 'Problems are reported at the end of the run.' : 'No problems reported.'}</p>}
                  <a className="sr-col-open" href={`#/runs/${c.run.id}`}>Replay the run step by step →</a>
                </>
              )}
            </article>
          ))}
        </div>
      </section>

      {s.scanner && (
        <section className="card" aria-labelledby="ss" style={{ marginTop: 16 }}>
          <h3 className="section-title" id="ss">What the scanner says</h3>
          <p><b>{plural(s.scanner.violations, 'axe-core rule violation')}</b> on {plural(s.scanner.pages, 'page')}, in the state each customer saw them. A scanner counts rules; the customers above show which problems actually slowed or stopped a purchase.</p>
          {s.scanner.rules.length > 0 && <p className="note">Rules: {s.scanner.rules.join(', ')}.</p>}
        </section>
      )}
      {s.agentAccess && (
        <section className="card" aria-labelledby="sa" style={{ marginTop: 16 }}>
          <h3 className="section-title" id="sa">Can AI assistants shop here?</h3>
          <p><b>{s.agentAccess.verdict === 'open' ? 'Open' : s.agentAccess.verdict === 'restricted' ? 'Partly closed' : 'Closed to automated browsers'}</b> <span className="note">(checked {shortDate(s.agentAccess.checkedAt)})</span></p>
          <ul className="note">{s.agentAccess.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>
      )}
    </article>
  );
}
