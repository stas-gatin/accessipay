// Friction signals per blocked run: what "stuck" looks like in numbers. Each metric column has its own
// scale; the thin tick marks the highest value seen in any paid demo-shop run, for comparison.
import React from 'react';
import { Card, ChartBox, DataTable, useInView, useTip } from './kit.jsx';
import { personaLabel, defectLabel, paidDemo, outcomeShape, plural } from './derive.js';

const METRICS = [
  { k: 'deadEnds', h: 'Failed actions', d: 'the element was not there or could not be used' },
  { k: 'noEffect', h: 'Changed nothing', d: 'actions after which the page looked exactly the same' },
  { k: 'longestStall', h: 'Longest stall', d: 'longest run of steps that never reached a new screen' },
  { k: 'mostRepeatedState', h: 'Most repeated screen', d: 'times the same screen came back' },
];

function Cell({ m, r, max, ref0, seen, delay, who }) {
  const v = r[m.k];
  const tip = useTip({ value: `${v}`, label: `${m.h}, ${who}`, lines: [`Paid runs: at most ${ref0}`] });
  return (
    <span className="ax-fcell">
      <span className="ax-fname">{m.h}</span>
      <span className="ax-bar-row">
        <span className="ax-track">
          <span role="img" tabIndex={0} aria-label={`${who}, ${m.h}: ${v}; highest in a paid run: ${ref0}`} className="ax-bar bad-soft" style={{ width: seen ? `${(v / max) * 100}%` : 0, transitionDelay: `${delay}ms` }} {...tip} />
          <i className="ax-ref" style={{ left: `${(ref0 / max) * 100}%` }} aria-hidden="true" />
        </span>
        <span className="ax-val">{v}</span>
      </span>
    </span>
  );
}

export default function Friction({ a, meta }) {
  const [ref, seen] = useInView();
  const blockedAll = a.runRows.filter((r) => outcomeShape(r.outcome) === 'blocked');
  const blocked = blockedAll.filter((r) => r.steps > 0);
  const empty = blockedAll.length - blocked.length;
  const paid = paidDemo(a.runRows);
  const refMax = Object.fromEntries(METRICS.map((m) => [m.k, Math.max(0, ...paid.map((r) => r[m.k] || 0))]));
  const colMax = Object.fromEntries(METRICS.map((m) => [m.k, Math.max(1, refMax[m.k], ...blocked.map((r) => r[m.k] || 0))]));
  const who = (r) => `${personaLabel(meta, r.persona)}, ${defectLabel(meta, r.defect) || 'demo shop'}`;

  const maxRep = Math.max(0, ...blocked.map((r) => r.mostRepeatedState));
  const maxStall = Math.max(0, ...blocked.map((r) => r.longestStall));
  const totalNo = blocked.reduce((t, r) => t + r.noEffect, 0);
  const takeaway = blocked.length
    ? `Blocked customers went in circles: the same screen came back up to ${maxRep} times and up to ${maxStall} steps passed without a new screen, with ${totalNo} actions that changed nothing. No paid run saw a screen more than ${refMax.mostRepeatedState} ${refMax.mostRepeatedState === 1 ? 'time' : 'times'}.`
    : 'No blocked runs with recorded steps.';

  return (
    <Card wide title="Friction signals in blocked runs" takeaway={takeaway}
      note={`${METRICS.map((m) => `${m.h}: ${m.d}.`).join(' ')}${empty ? ` ${plural(empty, 'blocked run')} recorded no steps and ${empty === 1 ? 'is' : 'are'} left out.` : ''}`}>
      <ul className="ax-legend" aria-label="Legend">
        <li><i className="ax-key rect bad-soft" aria-hidden="true" />Blocked run</li>
        <li><i className="ax-key tick" aria-hidden="true" />Black tick: highest value in any paid run</li>
      </ul>
      <ChartBox>
        <div className="ax-friction" ref={ref}>
          <div className="ax-frow ax-fhead" aria-hidden="true">
            <span />
            {METRICS.map((m) => <span key={m.k}>{m.h}</span>)}
          </div>
          {blocked.map((r, i) => (
            <div className="ax-frow" key={r.id}>
              <span className="ax-frun">
                <strong>{personaLabel(meta, r.persona)}</strong>
                <span className="ax-dim">{defectLabel(meta, r.defect) || 'Demo shop'}</span>
                <span className="ax-dim">Blocked at {r.furthestStage} after <span className="ax-nw">{r.steps} steps</span></span>
                <a className="ax-nw ax-sublink" href={`#/runs/${r.id}`}>Watch replay<span className="sr-only">, {who(r)}</span></a>
              </span>
              {METRICS.map((m, j) => <Cell key={m.k} m={m} r={r} max={colMax[m.k]} ref0={refMax[m.k]} seen={seen} delay={i * 80 + j * 40} who={who(r)} />)}
            </div>
          ))}
        </div>
      </ChartBox>
      <DataTable caption="Friction signals in blocked runs" numeric={[2, 3, 4, 5, 6]}
        head={['Customer', 'Defect', 'Steps', ...METRICS.map((m) => m.h)]}
        rows={[...blocked.map((r) => [personaLabel(meta, r.persona), defectLabel(meta, r.defect) || 'Demo shop', r.steps, ...METRICS.map((m) => r[m.k])]),
          ['Paid runs (highest)', '—', '—', ...METRICS.map((m) => refMax[m.k])]]} />
    </Card>
  );
}
