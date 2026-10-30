// Effort per customer type: median steps, keypresses and the keystroke-level time estimate,
// the formula behind the estimate, navigation overhead, and where in the checkout the steps go.
import React from 'react';
import { ChartBox, Card, Bar, DataTable, Legend, useInView, useTip, useWidth } from './kit.jsx';
import { KLM, STAGE_ORDER, median, range, fmtRange, fmtSeconds, personaLabel, paidDemo, typicalRuns, stagesUsed, shortId, pct , lc } from './derive.js';

function order(meta, list) {
  const keys = Object.keys(meta.personas || {});
  return [...list].sort((x, y) => keys.indexOf(x.persona) - keys.indexOf(y.persona));
}

function MetricCard({ title, rows, max, takeaway, format = (v) => v, note }) {
  const [ref, seen] = useInView();
  return (
    <Card title={title} takeaway={takeaway} note={note}>
      <ChartBox>
        <div className="ax-rows" ref={ref}>
          {rows.map((r, i) => (
            <div className="ax-row" key={r.persona}>
              <span className="ax-label">{r.label}</span>
              {r.value == null ? (
                <span className="ax-na">{r.na}</span>
              ) : (
                <Bar value={r.value} max={max} seen={seen} delay={i * 90} label={format(r.value)}
                  aria={`${r.label}: ${format(r.value)}`}
                  tip={{ value: format(r.value), label: `${r.label}, median of ${r.n} paid ${r.n === 1 ? 'run' : 'runs'}`, lines: r.range ? [`Range ${r.range}`] : [] }} />
              )}
            </div>
          ))}
        </div>
      </ChartBox>
    </Card>
  );
}

export function EffortCards({ a, meta }) {
  const effort = order(meta, a.effort.filter((e) => e.runs > 0));
  const paid = paidDemo(a.runRows);
  const of = (p) => paid.filter((r) => r.persona === p);
  const FIELD = { medianSteps: 'steps', medianKeys: 'keys', medianKlm: 'klmSeconds' };
  const rows = (key, na) => effort.map((e) => {
    const rg = range(of(e.persona).map((x) => x[FIELD[key]]));
    return {
      persona: e.persona, label: personaLabel(meta, e.persona), n: e.runs, value: e[key], na: na?.(e),
      range: rg ? (key === 'medianKlm' ? `${fmtSeconds(rg[0])} to ${fmtSeconds(rg[1])}` : fmtRange(rg)) : null,
    };
  });

  const steps = rows('medianSteps');
  const withSteps = steps.filter((r) => r.value != null);
  const hi = withSteps.reduce((m, r) => (r.value > (m?.value ?? -1) ? r : m), null);
  const lo = withSteps.reduce((m, r) => (r.value < (m?.value ?? Infinity) ? r : m), null);
  const stepsTake = hi && lo && hi !== lo
    ? `The ${lc(hi.label)} needs a median of ${hi.value} steps to pay, ${(hi.value / lo.value).toFixed(1)} times the ${lc(lo.label)} (${lo.value}).`
    : hi ? `Median steps to pay: ${hi.value}.` : 'No paid runs yet.';

  const keys = rows('medianKeys');
  const humanKeys = keys.filter((r) => r.persona !== 'agent' && r.value != null);
  const kHi = humanKeys.reduce((m, r) => (r.value > (m?.value ?? -1) ? r : m), null);
  const keysTake = kHi ? `People pay with keys: the ${lc(kHi.label)} pressed a median of ${kHi.value} keys. The AI agent acts on elements directly and presses almost none.` : 'No keypresses recorded yet.';

  const klm = rows('medianKlm', (e) => (e.persona === 'agent' ? 'No estimate: not a person' : 'Not enough data'));
  const humans = klm.filter((r) => r.value != null);
  const klmTake = humans.length ? `Estimated time to pay for this path: ${humans.map((r) => `${fmtSeconds(r.value)} (${lc(r.label)})`).join(', ')}.` : 'No estimate yet.';

  return (
    <>
    <div className="ax-grid three">
      <MetricCard title="Steps to pay" rows={steps} max={Math.max(1, ...steps.map((r) => r.value || 0))} takeaway={stepsTake} note="Median over paid demo-shop runs. A step is one decision: one key, one field typed, or one element used." />
      <MetricCard title="Keypresses to pay" rows={keys} max={Math.max(1, ...keys.map((r) => r.value || 0))} takeaway={keysTake} note="Tab, Enter and arrow keys count 1; typing counts every character plus Enter." />
      <MetricCard title="Time to pay, estimate" rows={klm} max={Math.max(1, ...klm.map((r) => r.value || 0))} format={fmtSeconds} takeaway={klmTake} note="Keystroke-level model estimate for the recorded path. Not measured time, and never the run's duration." />
    </div>
    <DataTable caption="Effort per customer type" numeric={[1, 2, 3, 4]} head={['Customer', 'Paid demo-shop runs', 'Median steps', 'Median keypresses', 'Time to pay (estimate)']} rows={effortTable(a, meta)} />
    </>
  );
}

// The formula, with one worked example taken from a real paid run.
export function Formula({ a, meta }) {
  const humans = typicalRuns(a).filter((t) => t.run.klmSeconds != null);
  const ex = humans.sort((x, y) => (y.run.wordsHeard || 0) - (x.run.wordsHeard || 0))[0];
  const r = ex?.run;
  const k = r ? r.keys * KLM.keystroke : 0;
  const m = r ? r.steps * KLM.mental : 0;
  const l = r ? ((r.wordsHeard || 0) / KLM.wordsPerMinute) * 60 : 0;
  return (
    <aside className="ax-formula" aria-labelledby="ax-formula-h">
      <h3 id="ax-formula-h">How the time estimate is made</h3>
      <p className="ax-eq"><span>estimate</span> = <span>keypresses × {KLM.keystroke} s</span> + <span>steps × {KLM.mental} s</span> + <span>words heard ÷ {KLM.wordsPerMinute} words per minute</span></p>
      <p className="ax-note">Keystroke-level model (Card, Moran and Newell, 1983): {KLM.keystroke} s per keystroke for an average typist, {KLM.mental} s to decide each step. Words heard counts only for the screen reader customer.</p>
      {r && (
        <p className="ax-worked">
          Worked example, {lc(personaLabel(meta, ex.persona))} (<a href={`#/runs/${r.id}`}>run {shortId(r.id)}</a>): {r.keys} × {KLM.keystroke} s = {k.toFixed(1)} s, plus {r.steps} × {KLM.mental} s = {m.toFixed(1)} s{r.wordsHeard ? <>, plus {r.wordsHeard} words ÷ {KLM.wordsPerMinute} wpm = {l.toFixed(1)} s</> : null}. Total {(k + m + l).toFixed(1)} s, about <strong>{fmtSeconds(r.klmSeconds)}</strong> (estimate).
        </p>
      )}
      <ul className="ax-caveats">
        <li>It estimates a skilled, error-free person following this exact path, including the customer model's own detours.</li>
        <li>The screen reader customer receives the whole page structure at once; real users take longer to orient, so treat its numbers as a lower bound.</li>
        <li>No estimate for the AI agent: it has no keystroke time. The run's wall-clock time is mostly AI thinking and is never shown as a person's time.</li>
      </ul>
    </aside>
  );
}

export function NavOverhead({ a, meta }) {
  const [ref, seen] = useInView();
  const paid = paidDemo(a.runRows).filter((r) => r.persona !== 'agent');
  const personas = order(meta, [...new Set(paid.map((r) => r.persona))].map((p) => ({ persona: p })));
  const rows = personas.map(({ persona }) => {
    const runs = paid.filter((r) => r.persona === persona);
    return { persona, label: personaLabel(meta, persona), value: median(runs.map((r) => r.tabShare)), n: runs.length, tabs: median(runs.map((r) => r.tabs)), steps: median(runs.map((r) => r.steps)), range: fmtRange(range(runs.map((r) => r.tabShare))) };
  });
  const top = rows.reduce((m, r) => (r.value > (m?.value ?? -1) ? r : m), null);
  return (
    <Card title="Steps spent only moving focus" takeaway={top ? `For the ${lc(top.label)}, ${top.value}% of the steps to pay were Tab or Shift+Tab presses just to get somewhere.` : 'No paid runs by people yet.'}
      note="Share of steps that were Tab or Shift+Tab, median over paid demo-shop runs. The AI agent does not move focus, so it is left out.">
      <ChartBox>
        <div className="ax-rows" ref={ref}>
          {rows.map((r, i) => (
            <div className="ax-row" key={r.persona}>
              <span className="ax-label">{r.label}</span>
              <Bar value={r.value} max={100} seen={seen} delay={i * 90} label={`${r.value}%`} aria={`${r.label}: ${r.value}% of steps moved focus`}
                tip={{ value: `${r.value}%`, label: `${r.label}, median of ${r.n} paid runs`, lines: [`Range ${r.range}%`, `Median ${r.tabs} Tab presses of ${r.steps} steps`] }} />
            </div>
          ))}
        </div>
      </ChartBox>
      <DataTable caption="Steps spent only moving focus" numeric={[1, 2, 3]} head={['Customer', 'Median share', 'Range', 'Paid runs']} rows={rows.map((r) => [r.label, `${r.value}%`, `${r.range}%`, r.n])} />
    </Card>
  );
}

function StackRow({ t, label, stages, max, seen, index, width }) {
  const total = stages.reduce((s, st) => s + (t.run.stepsPerStage?.[st] || 0), 0);
  return (
    <div className="ax-stack-row">
      <span className="ax-label">
        {label}
        <a className="ax-sublink" href={`#/runs/${t.run.id}`}>run {shortId(t.run.id)}<span className="sr-only">, {label}</span></a>
      </span>
      <span className="ax-stack-line">
        <span className="ax-stack" style={{ width: seen ? `${(total / max) * 100}%` : 0, transitionDelay: `${index * 120}ms` }}>
          {stages.map((st) => {
            const v = t.run.stepsPerStage?.[st] || 0;
            if (!v) return null;
            return <Seg key={st} st={st} v={v} total={total} label={label} />;
          })}
        </span>
        <span className="ax-val">{total}</span>
      </span>
    </div>
  );
}

function Seg({ st, v, total, label }) {
  const tip = useTip({ value: `${v} steps`, label: `${st}, ${label}`, lines: [`${pct(v, total)}% of this run's ${total} steps`] });
  return <span role="img" tabIndex={0} aria-label={`${label}, ${st}: ${v} steps`} className={`ax-seg s${STAGE_ORDER.indexOf(st) + 1}`} style={{ flexGrow: v }} {...tip} />;
}

export function WhereEffort({ a, meta }) {
  const [ref, seen] = useInView();
  const [wref, width] = useWidth();
  const typical = order(meta, typicalRuns(a));
  const stages = stagesUsed(typical.map((t) => t.run));
  const totals = typical.map((t) => stages.reduce((s, st) => s + (t.run.stepsPerStage?.[st] || 0), 0));
  const max = Math.max(1, ...totals);
  const lead = typical.map((t, i) => {
    const best = stages.reduce((m, st) => ((t.run.stepsPerStage?.[st] || 0) > (t.run.stepsPerStage?.[m] || 0) ? st : m), stages[0]);
    return { persona: t.persona, stage: best, share: pct(t.run.stepsPerStage?.[best] || 0, totals[i]) };
  });
  const same = lead.length && lead.every((l) => l.stage === lead[0].stage);
  const shares = lead.map((l) => l.share);
  const takeaway = !lead.length ? 'No paid runs yet.' : same
    ? `${lead[0].stage} takes the most steps for every customer type: ${Math.min(...shares)}% to ${Math.max(...shares)}% of the path to pay.`
    : lead.map((l) => `${personaLabel(meta, l.persona)}: most steps in ${l.stage} (${l.share}%)`).join('; ') + '.';
  return (
    <Card wide title="Where the steps go, by checkout stage" takeaway={takeaway}
      note="One typical paid run per customer type (the paid demo-shop run closest to that type's median steps). Each step is counted at the stage of the page it started on.">
      <Legend items={stages.map((s) => ({ label: s, cls: `rect s${STAGE_ORDER.indexOf(s) + 1}` }))} />
      <ChartBox>
        <div className="ax-stacks" ref={(el) => { ref.current = el; wref.current = el; }} data-w={width}>
          {typical.map((t, i) => <StackRow key={t.persona} t={t} label={personaLabel(meta, t.persona)} stages={stages} max={max} seen={seen} index={i} width={width} />)}
        </div>
      </ChartBox>
      <DataTable caption="Steps per checkout stage" numeric={stages.map((_, i) => i + 2).concat([stages.length + 2])}
        head={['Customer', 'Run', ...stages, 'Total']}
        rows={typical.map((t, i) => [personaLabel(meta, t.persona), shortId(t.run.id), ...stages.map((s) => t.run.stepsPerStage?.[s] || 0), totals[i]])} />
    </Card>
  );
}

export function effortTable(a, meta) {
  return order(meta, a.effort).map((e) => [personaLabel(meta, e.persona), e.runs, e.medianSteps ?? '—', e.medianKeys ?? '—', e.medianKlm == null ? 'none' : `${fmtSeconds(e.medianKlm)} (estimate)`]);
}
