// The charts carried over from the first analytics page: scanner against reality, the checkout funnel,
// outcome by customer type, problem themes, and the real sites. Each now has a computed takeaway.
import React from 'react';
import { OUTCOME } from '../api.js';
import { Bar, Card, ChartBox, CountUp, DataTable, Legend, useInView, useTip } from './kit.jsx';
import { personaLabel, pct, plural, shortId , lc } from './derive.js';

export function Matrix({ m }) {
  const demo = m.cleanBought + m.cleanBlocked + m.flaggedBought + m.flaggedBlocked;
  const clean = m.cleanBought + m.cleanBlocked;
  const takeaway = clean
    ? `${m.cleanBlocked} of ${clean} demo-shop runs on pages axe-core called clean still ended with the customer blocked.`
    : 'No runs on scanner-clean pages yet.';
  const cell = (label, value, cls, note) => (
    <div className={`ax-cell ${cls}`}>
      <span className="ax-cell-n"><CountUp value={value} /></span>
      <span className="ax-cell-l">{label}</span>
      {note && <span className="ax-cell-note">{note}</span>}
    </div>
  );
  return (
    <Card title="Scanner versus reality" takeaway={takeaway} note={`All ${demo} demo-shop runs, by what axe-core said about the same pages and whether the customer paid.`}>
      <div className="ax-matrix" role="group" aria-label="Scanner verdict against the real outcome">
        <span />
        <span className="ax-axis">Customer paid</span>
        <span className="ax-axis">Customer blocked</span>
        <span className="ax-axis side">Scanner: clean</span>
        {cell('clean and paid', m.cleanBought, '')}
        {cell('clean, yet blocked', m.cleanBlocked, 'alert', 'The scanner said yes. The customer could not pay.')}
        <span className="ax-axis side">Scanner: issues</span>
        {cell('flagged and paid', m.flaggedBought, '')}
        {cell('flagged and blocked', m.flaggedBlocked, '')}
      </div>
      <DataTable caption="Scanner versus reality" numeric={[1, 2]} head={['Scanner verdict', 'Customer paid', 'Customer blocked']}
        rows={[['Clean', m.cleanBought, m.cleanBlocked], ['Issues found', m.flaggedBought, m.flaggedBlocked]]} />
    </Card>
  );
}

export function Funnel({ data }) {
  const [ref, seen] = useInView();
  const top = data[0]?.runs || 1;
  let worst = null;
  data.forEach((d, i) => { if (i > 0) { const lost = data[i - 1].runs - d.runs; if (!worst || lost > worst.lost) worst = { lost, from: data[i - 1].stage, to: d.stage }; } });
  const last = data[data.length - 1];
  const takeaway = last ? `${last.runs} of ${top} demo-shop runs reached ${last.stage.toLowerCase()} (${pct(last.runs, top)}%)${worst?.lost ? `; the biggest loss was between ${worst.from.toLowerCase()} and ${worst.to.toLowerCase()} (${plural(worst.lost, 'run')})` : ''}.` : '';
  return (
    <Card title="Where customers stop" takeaway={takeaway} note="Demo-shop runs: how many reached each stage of the checkout.">
      <ChartBox>
        <ol className="ax-rows ax-funnel" ref={ref}>
          {data.map((d, i) => {
            const lost = i > 0 ? data[i - 1].runs - d.runs : 0;
            return (
              <li className="ax-row" key={d.stage}>
                <span className="ax-label">{d.stage}</span>
                <Bar value={d.runs} max={top} seen={seen} delay={i * 90} label={<>{d.runs}{lost > 0 && <em className="ax-lost"> −{lost}</em>}</>}
                  aria={`${d.stage}: ${d.runs} runs${lost ? `, ${lost} fewer than the stage before` : ''}`}
                  tip={{ value: `${d.runs} runs`, label: `reached ${d.stage.toLowerCase()} (${pct(d.runs, top)}%)`, lines: lost ? [`${lost} stopped before this stage`] : [] }} />
              </li>
            );
          })}
        </ol>
      </ChartBox>
      <DataTable caption="Where customers stop" numeric={[1, 2]} head={['Stage', 'Runs that reached it', 'Share of all runs']} rows={data.map((d) => [d.stage, d.runs, `${pct(d.runs, top)}%`])} />
    </Card>
  );
}

function OutcomeSeg({ cls, w, seen, tip, aria }) {
  const h = useTip(tip);
  return <span role="img" tabIndex={0} aria-label={aria} className={`ax-oseg ${cls}`} style={{ flexGrow: seen ? w : 0.0001 }} {...h} />;
}

export function Outcomes({ data, meta }) {
  const [ref, seen] = useInView();
  const keys = Object.keys(meta.personas || {});
  const rows = [...data].sort((x, y) => keys.indexOf(x.persona) - keys.indexOf(y.persona));
  const max = Math.max(1, ...rows.map((d) => d.runs));
  const worst = rows.reduce((m, d) => (!m || d.success / d.runs < m.success / m.runs ? d : m), null);
  const takeaway = worst ? `The ${lc(personaLabel(meta, worst.persona))} was blocked most often: ${worst.blocked} of ${worst.runs} runs (${pct(worst.blocked, worst.runs)}%).` : '';
  return (
    <Card title="Outcome by customer type" takeaway={takeaway} note="Every finished run, demo shop and real sites. On real sites reaching payment counts as success, since nothing is paid there.">
      <Legend items={[{ label: 'Paid or reached payment', cls: 'rect ok' }, { label: 'Blocked', cls: 'rect bad' }]} />
      <ChartBox>
        <div className="ax-rows" ref={ref}>
          {rows.map((d) => {
            const label = personaLabel(meta, d.persona);
            return (
              <div className="ax-row" key={d.persona}>
                <span className="ax-label">{label}</span>
                <span className="ax-bar-row">
                  <span className="ax-otrack-wrap"><span className="ax-track ax-otrack" style={{ width: `${(d.runs / max) * 100}%` }}>
                    {d.success > 0 && <OutcomeSeg cls="ok" w={d.success} seen={seen} aria={`${label}: ${d.success} succeeded`} tip={{ value: `${d.success} of ${d.runs}`, label: `${label}: paid or reached payment` }} />}
                    {d.blocked > 0 && <OutcomeSeg cls="bad" w={d.blocked} seen={seen} aria={`${label}: ${d.blocked} blocked`} tip={{ value: `${d.blocked} of ${d.runs}`, label: `${label}: blocked` }} />}
                  </span></span>
                  <span className="ax-val">{d.success} / {d.runs}</span>
                </span>
              </div>
            );
          })}
        </div>
      </ChartBox>
      <DataTable caption="Outcome by customer type" numeric={[1, 2, 3, 4]} head={['Customer', 'Runs', 'Succeeded', 'Blocked', 'Median steps to succeed']}
        rows={rows.map((d) => [personaLabel(meta, d.persona), d.runs, d.success, d.blocked, d.medianSteps ?? '—'])} />
    </Card>
  );
}

export function Themes({ data, findings }) {
  const [ref, seen] = useInView();
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...sorted.map((d) => d.count));
  const top = sorted[0];
  const takeaway = top ? `Most reported: ${top.theme.toLowerCase()} (${plural(top.count, 'report')} of ${findings}), followed by ${sorted[1]?.theme.toLowerCase() || 'nothing else'}${sorted[1] ? ` (${sorted[1].count})` : ''}.` : '';
  return (
    <Card title="What gets in the way" takeaway={takeaway} note="Problems the customers reported in their own words, grouped by theme. One report can fall in two themes.">
      <ChartBox>
        <div className="ax-rows" ref={ref}>
          {sorted.map((d, i) => (
            <div className="ax-row wide" key={d.theme}>
              <span className="ax-label">{d.theme}</span>
              <Bar value={d.count} max={max} seen={seen} delay={i * 80} label={d.count} aria={`${d.theme}: ${d.count} reports`}
                tip={{ value: `${d.count} reports`, label: d.theme, lines: [`${pct(d.count, findings)}% of all ${findings} reports`] }} />
            </div>
          ))}
        </div>
      </ChartBox>
      <DataTable caption="What gets in the way" numeric={[1]} head={['Theme', 'Reports']} rows={sorted.map((d) => [d.theme, d.count])} />
    </Card>
  );
}

function Untested({ list }) {
  if (!list.length) return null;
  const hosts = [...new Set(list.map((s) => s.host))];
  return (
    <p className="ax-note">
      Not testable: {hosts.join(', ')}. {hosts.length === 1 ? 'This site' : `These ${hosts.length} sites`} showed bot protection or asked not to be visited, so AccessiPay stopped before any step. An automated shopping agent can meet the same wall.
    </p>
  );
}

export function Sites({ data, meta, untested = [] }) {
  if (!data.length) return untested.length ? <Untested list={untested} /> : <p className="ax-empty">No real-site runs yet.</p>;
  const reached = data.filter((s) => s.outcome === 'reached-payment').length;
  const issues = data.reduce((t, s) => t + (s.violations || 0), 0);
  const reports = data.reduce((t, s) => t + s.findings, 0);
  return (
    <>
      <p className="ax-takeaway">The customer reached the payment step on {reached} of {plural(data.length, 'site')}. axe-core reported {issues} issues on the pages it saw; the customer reported {reports} problems in its own words. The two lists measure different things and are not added together.</p>
      <div className="ax-sites">
        {data.map((s) => (
          <a key={s.id} className="ax-site" href={`#/runs/${s.id}`}>
            <span className="ax-site-host">{s.host}</span>
            <span className={`pill ${OUTCOME[s.outcome]?.tone || 'muted'}`}>{s.outcome === 'reached-payment' ? 'Reached payment' : `${OUTCOME[s.outcome]?.label || s.outcome} at ${s.stage}`}</span>
            <span className="ax-site-stats">
              <span><b>{s.violations ?? '—'}</b> axe-core issues on {plural(s.pages, 'page')}</span>
              <span><b>{s.findings}</b> problems the customer reported</span>
              <span><b>{s.steps}</b> steps · run {shortId(s.id)}</span>
            </span>
            <span className="ax-site-rules">{s.rules.slice(0, 6).join(' · ')}</span>
          </a>
        ))}
      </div>
      <DataTable caption="Real sites" numeric={[3, 4, 5, 6]} head={['Site', 'Customer', 'Outcome', 'Steps', 'Pages scanned', 'axe-core issues', 'Problems reported', 'axe-core rules']}
        rows={data.map((s) => [s.host, personaLabel(meta, s.persona), s.outcome === 'reached-payment' ? 'Reached payment' : s.outcome, s.steps, s.pages, s.violations ?? '—', s.findings, s.rules.join(', ')])} />
      <Untested list={untested} />
    </>
  );
}
