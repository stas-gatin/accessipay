import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { CountUp, Section } from './analytics/kit.jsx';
import Pairs from './analytics/Pairs.jsx';
import { EffortCards, Formula, NavOverhead, WhereEffort } from './analytics/Effort.jsx';
import Friction from './analytics/Friction.jsx';
import { RunFilters, useRunFilter, ScatterCard, RunTable, Consistency } from './analytics/Runs.jsx';
import { Matrix, Funnel, Outcomes, Themes, Sites } from './analytics/Kept.jsx';
import { sum, plural, fmtSeconds, fmtRange, range, conditions, outcomeShape } from './analytics/derive.js';
import './analytics/analytics.css';

const SECTIONS = [
  ['an-fixed', 'Impossible → possible'],
  ['an-scanner', 'Scanner versus reality'],
  ['an-effort', 'Effort per customer'],
  ['an-stuck', 'Where customers get stuck'],
  ['an-runs', 'Every run'],
  ['an-problems', 'What gets in the way'],
  ['an-sites', 'Real sites'],
  ['an-method', 'Method'],
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

function RunsSection({ a, meta }) {
  const f = useRunFilter(a.runRows);
  const blocked = f.filtered.filter((r) => outcomeShape(r.outcome) === 'blocked').length;
  return (
    <>
      <RunFilters meta={meta} rows={a.runRows} {...f} />
      <p className="ax-count" aria-live="polite">Showing {plural(f.filtered.length, 'run')} of {a.runRows.length}: {f.filtered.length - blocked} paid or reached payment, {blocked} blocked.</p>
      <div className="ax-grid">
        <ScatterCard rows={f.filtered} meta={meta} />
        <figure className="ax-card wide">
          <figcaption>
            <h3>All runs, all metrics</h3>
            <p className="ax-note">Sort by any column. Real-site runs and demo-shop runs are listed together here but never averaged together anywhere on this page.</p>
          </figcaption>
          <RunTable rows={f.filtered} meta={meta} />
        </figure>
      </div>
    </>
  );
}

export default function Analytics({ meta }) {
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/api/analytics').then(setA).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="page"><p className="empty" role="alert">{error}</p></div>;
  if (!a) return <div className="page"><p className="empty">Loading…</p></div>;
  const t = a.totals;
  const think = sum(a.runRows.map((r) => r.aiThinkSeconds));
  const thinkSteps = sum(a.runRows.filter((r) => r.aiThinkSeconds > 0).map((r) => r.steps));
  const unblocked = a.pairs.filter((p) => p.kind === 'unblocked');
  const conds = conditions(a.runRows, meta);

  return (
    <div className="page ax">
      <p className="eyebrow">Analytics</p>
      <h1>What the runs show</h1>
      <p className="lead">Every number on this page is computed from the {t.runs} finished runs on this server: {t.demoRuns} in the demo shop, where PayPal sandbox confirms each payment, and {t.realRuns} on public demo stores of real e-commerce platforms. Each figure links back to the runs behind it.</p>

      <div className="ax-kpis">
        <Kpi value={t.runs} label="finished runs" sub={`${t.demoRuns} demo shop · ${t.realRuns} real sites`} />
        <Kpi value={t.paid} label="paid orders in the demo shop" sub={`median ${t.medianStepsToBuy ?? '—'} steps each`} />
        <Kpi value={t.sandboxOrders} label="orders PayPal sandbox confirmed" sub={`of the ${t.paid} paid orders, status COMPLETED`} />
        <Kpi value={t.unblockedByFix} label="customers unblocked by an AI fix" sub="blocked before, paid after" tone="good" />
        <Kpi value={t.blockedWhileClean} label="blocked while the scanner said clean" sub="axe-core found nothing" tone="alert" />
        <Kpi value={t.steps} label="steps taken, all runs" sub="one decision each" />
        <Kpi value={t.keys} label="keypresses, all runs" sub="Tab, Enter, typed characters" />
        <Kpi value={t.deadEnds} label="dead ends" sub="actions that failed" />
        <Kpi value={t.findings} label="problems customers reported" sub="in their own words" />
        <Kpi value={t.sites} label="real sites tested" sub="stopped at payment" />
      </div>

      <nav className="ax-toc" aria-label="Sections on this page">
        <span>On this page</span>
        <ol>{SECTIONS.map(([id, label]) => <li key={id}><a href={`#/analytics`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ block: 'start' }); }}>{label}</a></li>)}</ol>
      </nav>

      <Section id="an-fixed" n={1} title="Impossible → possible"
        intro={unblocked.length
          ? `${plural(unblocked.length, 'customer')} could not pay on the shop as built. After one AI fix, the same customer type with the same task on the same shop paid, and PayPal returned an order id. That is a change from impossible to possible, not a speed-up.`
          : 'The same customer on the same shop, before and after an AI fix.'}>
        <Pairs a={a} meta={meta} />
      </Section>

      <Section id="an-scanner" n={2} title="Scanner versus reality" intro="What an automated scanner said about the pages, against what happened when a customer tried to pay.">
        <div className="ax-grid">
          <Matrix m={a.matrix} />
          <Funnel data={a.funnel} />
        </div>
      </Section>

      <Section id="an-effort" n={3} title="Effort per customer type" intro="How much work a paid order takes for each kind of customer, from paid demo-shop runs only. Medians, with the range and number of runs in each tooltip and table.">
        <EffortCards a={a} meta={meta} />
        <div className="ax-grid">
          <Formula a={a} meta={meta} />
          <NavOverhead a={a} meta={meta} />
          <WhereEffort a={a} meta={meta} />
        </div>
      </Section>

      <Section id="an-stuck" n={4} title="Where customers get stuck" intro="Blocked runs rarely end abruptly. They loop: the same screen, actions that change nothing, steps that lead nowhere new.">
        <div className="ax-grid">
          <Friction a={a} meta={meta} />
          <Consistency a={a} meta={meta} />
        </div>
      </Section>

      <Section id="an-runs" n={5} title="Every run" intro="Each run with its per-run metrics. Filter by customer type and by shop; both filters apply to the plot and the table.">
        <RunsSection a={a} meta={meta} />
      </Section>

      <Section id="an-problems" n={6} title="What gets in the way" intro="Outcomes per customer type, and the problems customers described.">
        <div className="ax-grid">
          <Outcomes data={a.personas} meta={meta} />
          <Themes data={a.themes} findings={t.findings} />
        </div>
      </Section>

      <Section id="an-sites" n={7} title="Real sites" intro="Public demo stores of real e-commerce platforms. The customer goes as far as the payment step and stops; nothing is paid. axe-core scans every page the customer saw, in that state.">
        <Sites data={a.sites} meta={meta} />
      </Section>

      <Section id="an-method" n={8} title="Method and transparency">
        <div className="ax-grid">
          <div className="ax-card">
            <h3>Definitions</h3>
            <dl className="ax-defs">
              <dt>Step</dt><dd>One decision by the customer model: a key, a typed field, or one element used. Reading the page again is not a step.</dd>
              <dt>Keypress</dt><dd>Tab, Shift+Tab, Enter and arrow keys count 1; typing counts each character plus Enter. The AI agent acts on elements and presses almost no keys.</dd>
              <dt>Dead end</dt><dd>An action that failed: the element was missing, disabled or could not take focus.</dd>
              <dt>Changed nothing</dt><dd>An action after which the page the customer perceives was identical.</dd>
              <dt>Longest stall</dt><dd>The longest stretch of steps that only revisited screens already seen.</dd>
              <dt>Time to pay (estimate)</dt><dd>Keystroke-level model for people only. Never wall-clock time.</dd>
              <dt>Paid</dt><dd>Counted only when the payment completes and the goal check confirms the right item was bought. Most paid runs use the PayPal sandbox; a few earlier runs used a mock payment, which the sandbox figure leaves out.</dd>
            </dl>
          </div>
          <div className="ax-card ax-think">
            <h3>Transparency notes</h3>
            <p><strong>AI think time.</strong> The deciding AI spent {fmtSeconds(think)} in total across {plural(thinkSteps, 'step')}, about {thinkSteps ? (think / thinkSteps).toFixed(1) : '—'} s per step. This is time the deciding AI spent; not the customer's time. It depends on the model and its load, so it is never used as a customer's time on this page.</p>
            <p><strong>Simulated customers.</strong> The keyboard customer is told where focus is even when the focus ring is invisible, and the screen reader customer gets the whole page structure at once, so both find the way more easily than many real people would.</p>
            <p><strong>Small numbers.</strong> Each demo-shop condition has {fmtRange(range(conds.map((g) => g.runs.length)))} runs. Ranges and run counts are shown with every median, and medians of real-site and demo-shop runs are never mixed.</p>
          </div>
        </div>
      </Section>
    </div>
  );
}
