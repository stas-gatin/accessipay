// "Impossible → possible": the same customer on the same shop, as built and after the AI fix.
// A blocked-then-paid pair is never called "faster": before, the purchase did not happen at all.
import React from 'react';
import { useInView, GlyphKey, DataTable } from './kit.jsx';
import { STAGE_ORDER, personaLabel, defectLabel, outcomeLabel, outcomeShape, fmtRange, baseline, pairReplicates, plural } from './derive.js';

function StageTrack({ stage, outcome, seen, delay }) {
  const i = Math.max(0, STAGE_ORDER.indexOf(stage));
  const w = (i / (STAGE_ORDER.length - 1)) * 100;
  const shape = outcomeShape(outcome);
  return (
    <span className="ax-stagetrack" aria-hidden="true">
      {STAGE_ORDER.map((s, k) => <i key={s} className={`ax-stagetick ${k <= i ? 'on' : ''}`} style={{ left: `${(k / (STAGE_ORDER.length - 1)) * 100}%` }} />)}
      <span className={`ax-stageline ${shape === 'blocked' ? 'bad' : 'ok'}`} style={{ width: seen ? `${w}%` : 0, transitionDelay: `${delay}ms` }} />
      <span className={`ax-stageend ${seen ? 'in' : ''}`} style={{ left: `${w}%`, transitionDelay: `${delay + 700}ms` }}>
        <GlyphKey shape={shape} />
      </span>
    </span>
  );
}

function PairRow({ which, id, outcome, stage, steps, keys, order, seen, delay, agent }) {
  const ok = outcomeShape(outcome) !== 'blocked';
  const where = ok ? outcomeLabel(outcome) : `${outcomeLabel(outcome)} at ${stage}`;
  return (
    <div className="ax-pair-row">
      <span className="ax-pair-which">{which}</span>
      <span className="ax-pair-track" role="img" aria-label={`${which}: reached ${stage}, ${where}`}>
        <StageTrack stage={stage} outcome={outcome} seen={seen} delay={delay} />
      </span>
      <span className="ax-pair-stats">
        <span className={`pill ${ok ? 'ok' : 'bad'}`}>{where}</span>
        <span className="ax-nw"><b>{steps}</b> steps</span>
        {agent ? <span className="ax-nw" title="The AI agent acts on elements, not keys"><b>—</b> keypresses</span> : <span className="ax-nw"><b>{keys}</b> {keys === 1 ? 'keypress' : 'keypresses'}</span>}
        {order && <span>PayPal confirmed</span>}
      </span>
      <a className="ax-pair-go" href={`#/runs/${id}`}>Watch replay<span className="sr-only">: {which.toLowerCase()}</span> <span aria-hidden="true">→</span></a>
    </div>
  );
}

function PairCard({ p, a, meta, index }) {
  const [ref, seen] = useInView();
  const rep = pairReplicates(a.runRows, p, p.defect);
  const base = baseline(a.runRows, p.persona);
  const summary = (runs) => {
    if (!runs.length) return null;
    const good = runs.filter((r) => outcomeShape(r.outcome) !== 'blocked').length;
    const word = good === runs.length ? (runs.length === 1 ? 'paid' : 'all paid') : good === 0 ? (runs.length === 1 ? 'blocked' : 'all blocked') : `${good} paid, ${runs.length - good} blocked`;
    return `${plural(runs.length, 'run')}, ${word}, ${fmtRange([Math.min(...runs.map((r) => r.steps)), Math.max(...runs.map((r) => r.steps))])}\u00a0steps`;
  };
  const unblocked = p.kind === 'unblocked';
  return (
    <article className="ax-pair" ref={ref} aria-labelledby={`pair-${index}`}>
      <header className="ax-pair-head">
        <h3 id={`pair-${index}`}>{personaLabel(meta, p.persona)} <span className="ax-dim">· {defectLabel(meta, p.defect) || 'no injected defect'}</span></h3>
        <span className={`ax-flag ${unblocked ? 'ok' : p.kind === 'regressed' ? 'bad' : ''}`}>{p.label}</span>
      </header>
      <div className="ax-stagenames" aria-hidden="true">
        <span />
        <span className="ax-stagenames-row">{STAGE_ORDER.map((s, k) => <span key={s} style={{ left: `${(k / (STAGE_ORDER.length - 1)) * 100}%` }}>{s}</span>)}</span>
        <span />
        <span />
      </div>
      <PairRow which="Before, as built" id={p.before} outcome={p.beforeOutcome} stage={p.beforeStage} steps={p.beforeSteps} keys={p.beforeKeys} seen={seen} delay={0} agent={p.persona === 'agent'} />
      <PairRow which="After the AI fix" id={p.after} outcome={p.afterOutcome} stage={p.afterStage} steps={p.afterSteps} keys={p.afterKeys} order={p.order} seen={seen} delay={350} agent={p.persona === 'agent'} />
      <footer className="ax-pair-foot">
        {unblocked ? null : p.kind === 'effort' ? (
          <p>Same outcome before and after, so effort is compared: {p.afterSteps - p.beforeSteps >= 0 ? '+' : ''}{p.afterSteps - p.beforeSteps} steps{p.persona === 'agent' ? '' : `, ${p.afterKeys - p.beforeKeys >= 0 ? '+' : ''}${p.afterKeys - p.beforeKeys} keypresses`}.</p>
        ) : <p>The fix made the outcome worse for this customer.</p>}
        <ul className="ax-pair-facts">
          {summary(rep.before) && <li>Repeat runs as built: {summary(rep.before)}.</li>}
          {summary(rep.after) && <li>Repeat runs after the fix: {summary(rep.after)}.</li>}
          {base && <li>Same customer type on the shop without injected defects: {fmtRange(base.range)}{'\u00a0'}steps ({plural(base.runs.length, 'run')}){base.range[0] <= p.afterSteps && p.afterSteps <= base.range[1] ? ', the same length as after the fix' : ''}.</li>}
        </ul>
      </footer>
    </article>
  );
}

export default function Pairs({ a, meta }) {
  const pairs = a.pairs;
  if (!pairs.length) return <p className="ax-empty">No before-and-after pairs yet: run a customer, apply an AI fix, and run the same customer again.</p>;
  return (
    <>
      <PairLegend />
      <div className="ax-pairs">
        {pairs.map((p, i) => <PairCard key={p.after} p={p} a={a} meta={meta} index={i} />)}
      </div>
      <DataTable caption="Before and after pairs" numeric={[4, 5, 8, 9]}
        head={['Customer', 'Defect', 'Result', 'Before: outcome', 'Before: steps', 'Before: keypresses', 'Before: reached', 'After: outcome', 'After: steps', 'After: keypresses', 'After: reached', 'PayPal confirmed']}
        rows={pairs.map((p) => [personaLabel(meta, p.persona), defectLabel(meta, p.defect) || '—', p.label, outcomeLabel(p.beforeOutcome), p.beforeSteps, p.persona === 'agent' ? '—' : p.beforeKeys, p.beforeStage, outcomeLabel(p.afterOutcome), p.afterSteps, p.persona === 'agent' ? '—' : p.afterKeys, p.afterStage, p.order ? 'Yes' : 'No'])} />
    </>
  );
}

export function PairLegend() {
  return (
    <ul className="ax-legend" aria-label="Legend">
      <li><GlyphKey shape="paid" />Paid</li>
      <li><GlyphKey shape="blocked" />Blocked</li>
      <li><i className="ax-key line ok" aria-hidden="true" />Path to paid</li>
      <li><i className="ax-key line bad" aria-hidden="true" />Path that ended blocked</li>
    </ul>
  );
}
