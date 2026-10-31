import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { CountUp, Section } from './analytics/kit.jsx';
import Pairs from './analytics/Pairs.jsx';
import { EffortCards, Formula, NavOverhead, WhereEffort } from './analytics/Effort.jsx';
import Friction from './analytics/Friction.jsx';
import { ScatterCard, Consistency } from './analytics/Runs.jsx';
import { Matrix, Funnel, Outcomes, Themes } from './analytics/Kept.jsx';
import RunsTable from './analytics/RunsTable.jsx';
import DefectsGrid from './analytics/DefectsGrid.jsx';
import { plural, demoAnalytics } from './analytics/derive.js';
import './analytics/analytics.css';

const SECTIONS = [
  ['an-fixed', 'Impossible → possible'],
  ['an-scanner', 'Scanner versus reality'],
  ['an-runs', 'Every run'],
  ['an-more', 'More detail'],
];

function Kpi({ value, label, sub, tone = '' }) {
  return (
    <div className={`ax-kpi ${tone}`}>
      <span className="ax-kpi-n"><CountUp value={value} /></span>
      <span className="ax-kpi-l">{label}</span>
      {sub && <span className="ax-kpi-s">{sub}</span>}
    </div>
  );
}

function jump(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === 'DETAILS') el.open = true;
  el.scrollIntoView({ block: 'start' });
}

export default function Analytics({ meta }) {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([api('/api/analytics'), api('/api/runs').catch(() => [])])
      .then(([an, list]) => setRaw({ an, list }))
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="page"><p className="empty" role="alert">{error}</p></div>;
  if (!raw) return <div className="page"><p className="empty">Loading…</p></div>;

  const a = demoAnalytics(raw.an, raw.list, meta);
  const t = a.totals;
  const unblocked = a.unblocked;
  const left = [
    a.excluded.mock ? `${plural(a.excluded.mock, 'early run')} paid with a mock payment instead of the PayPal sandbox` : '',
    a.excluded.notStarted ? `${plural(a.excluded.notStarted, 'run')} that did not start` : '',
  ].filter(Boolean);

  return (
    <div className="page ax">
      <p className="eyebrow">Analytics</p>
      <h1>What the demo-shop runs show</h1>
      <p className="lead">
        Every number on this page comes from the {t.runs} recorded runs in our demo shop, where a test passes only when PayPal (Orders v2, sandbox) confirms the order. Each figure links to the runs behind it.
      </p>
      <p className="ax-realnote"><a href="#/results">Real shops: see Results <span aria-hidden="true">→</span></a><span> Every real shop is tested with all three customers, who stop at the payment step.</span></p>

      <div className="ax-kpis">
        <Kpi value={t.runs} label="runs counted" sub="demo shop, PayPal sandbox" />
        <Kpi value={t.sandboxOrders} label="orders PayPal confirmed" sub={`median ${t.medianStepsToBuy ?? '—'} steps to buy`} />
        <Kpi value={t.unblockedByFix} label={t.unblockedByFix === 1 ? 'blocker fixed by AI' : 'blockers fixed by AI'} sub={`${t.unblockedAfterPaid} of ${t.unblockedAfterRuns} re-runs paid`} tone="good" />
        <Kpi value={t.blockedWhileClean} label="blocked, scanner clean" sub="axe-core found nothing" tone="alert" />
        <Kpi value={t.steps} label="steps taken" sub="one decision each" />
        <Kpi value={t.keys} label="keypresses" sub="Tab, Enter, typed characters" />
        <Kpi value={t.deadEnds} label="failed actions" sub="control missing or unusable" />
        <Kpi value={t.findings} label="problems reported" sub="in the customers' own words" />
      </div>
      {left.length > 0 && <p className="ax-left">Left out of every figure: {left.join(', and ')}. They are still listed in <a href="#/analytics" onClick={(e) => { e.preventDefault(); jump('an-runs'); }}>every run</a>.</p>}

      <nav className="ax-toc" aria-label="Sections on this page">
        <span>On this page</span>
        <ol>{SECTIONS.map(([id, label]) => <li key={id}><a href="#/analytics" onClick={(e) => { e.preventDefault(); jump(id); }}>{label}</a></li>)}</ol>
      </nav>

      <Section id="an-fixed" n={1} title="Impossible → possible"
        intro={unblocked.length
          ? `${plural(unblocked.length, 'defect')} that stop a customer. As built: ${t.unblockedBeforeBlocked} of ${t.unblockedBeforeRuns} runs blocked. After one AI fix: ${t.unblockedAfterPaid} of ${t.unblockedAfterRuns} runs paid, each order confirmed by PayPal. Same customer type, same task, same shop. This is not a speed claim: before the fix the purchase did not happen at all, so there is no "before" time to compare. Each card shows the latest pair; repeats are listed under it.`
          : 'The same customer on the same shop, before and after an AI fix.'}>
        <Pairs a={a} meta={meta} />
      </Section>

      <Section id="an-scanner" n={2} title="Scanner versus reality" intro="What an automated scanner (axe-core) said about the pages, against what happened when a customer tried to pay.">
        <div className="ax-grid ax-top">
          <Matrix m={a.matrix} />
          <Funnel data={a.funnel} />
        </div>
        <figure className="ax-card wide ax-gridcard">
          <figcaption>
            <h3>Defects: scanner against customers</h3>
            <p className="ax-note">One row per defect we built into the demo shop. axe-core: the most issues it reported on the shop as built.</p>
          </figcaption>
          <DefectsGrid rows={a.runRows} meta={meta} />
        </figure>
      </Section>

      <Section id="an-runs" n={3} title="Every run" intro="Each recorded run with its per-run metrics. Sort any column, group by customer or outcome, and click a run to watch its replay.">
        <div className="ax-grid">
          <ScatterCard rows={a.runRows} meta={meta} />
          <figure className="ax-card wide ax-gridcard">
            <figcaption>
              <h3>All runs, all metrics</h3>
              <p className="ax-note">{a.all.length === t.runs ? `${t.runs} demo-shop runs, the same runs as every figure on this page.` : `${a.all.length} recorded demo-shop runs; ${t.runs} are counted in the figures (see the note at the top).`}</p>
            </figcaption>
            <RunsTable rows={a.all} meta={meta} />
          </figure>
        </div>
      </Section>

      <details className="ax-more" id="an-more">
        <summary className="ax-section-head">
          <span className="ax-section-n" aria-hidden="true">04</span>
          <span className="ax-more-text">
            <span className="ax-more-t" role="heading" aria-level={2}>More detail <span className="ax-more-chev" aria-hidden="true" /></span>
            <span className="ax-intro">Effort per customer type, where customers get stuck, what gets in the way.</span>
          </span>
        </summary>

        <Section id="an-effort" title="Effort per customer type" intro="How much work a paid order takes for each kind of customer, from paid runs only. Medians, with the range and number of runs in each tooltip and table.">
          <EffortCards a={a} meta={meta} />
          <Formula a={a} meta={meta} />
          <div className="ax-grid ax-top">
            <NavOverhead a={a} meta={meta} />
            <WhereEffort a={a} meta={meta} />
          </div>
        </Section>

        <Section id="an-stuck" title="Where customers get stuck" intro="Blocked runs rarely end abruptly. They loop: the same screen, actions that change nothing, steps that lead nowhere new.">
          <div className="ax-grid">
            <Friction a={a} meta={meta} />
            <Consistency a={a} meta={meta} />
          </div>
        </Section>

        <Section id="an-problems" title="What gets in the way" intro="Outcomes per customer type, and the problems customers described.">
          <div className="ax-grid ax-top">
            <Outcomes data={a.personas} meta={meta} />
            <Themes data={a.themes} findings={t.findings} />
          </div>
        </Section>
      </details>
    </div>
  );
}
