// Every run as a dot (steps against keypresses, shape and colour by outcome), and how stable results
// are across repeat runs of the same condition. The table of every run is an AG Grid (RunsTable.jsx).
import React, { useMemo } from 'react';
import { ChartBox, Card, DataTable, GlyphKey, OutcomeGlyph, useInView, useTip, useWidth } from './kit.jsx';
import { niceMax, ticks, median, personaLabel, defectLabel, outcomeLabel, outcomeShape, fmtRange, conditions, plural } from './derive.js';

function Dot({ r, x, y, meta, i, seen }) {
  const agent = r.persona === 'agent';
  const keys = agent ? 'no keys (acts on elements)' : `${r.keys} keypresses`;
  const label = `${personaLabel(meta, r.persona)}, ${defectLabel(meta, r.defect) || 'no injected defect'}${r.fixed ? ', after AI fix' : ''}: ${outcomeLabel(r.outcome)}, ${r.steps} steps, ${keys}. Open the replay`;
  const tip = useTip({ value: `${r.steps} steps · ${keys}`, label: `${outcomeLabel(r.outcome)} · ${personaLabel(meta, r.persona)}`, lines: [`${defectLabel(meta, r.defect) || 'No injected defect'}${r.fixed ? ', after AI fix' : ''}`, 'Click to watch the replay'] });
  return (
    <a href={`#/runs/${r.id}`} aria-label={label} className="ax-dotlink" {...tip}>
      <g className={`ax-dot ${seen ? 'in' : ''}`} style={{ transitionDelay: `${i * 40}ms`, transformOrigin: `${x}px ${y}px` }}>
        <circle cx={x} cy={y} r={12} className="ax-hit" />
        <circle cx={x} cy={y} r={7} className="ax-ring" />
        <OutcomeGlyph shape={outcomeShape(r.outcome)} x={x} y={y} r={5} />
      </g>
    </a>
  );
}

// Moves marks that would overlap apart vertically, in a fixed order (no randomness): the first mark
// stays, later ones step 9 px up, down, up... until they are clear. Tooltips keep the exact values.
function spread(points, gap = 12, limit = 3) {
  const out = [];
  for (const p of points) {
    let dy = 0;
    for (let k = 1; out.some((q) => Math.abs(q.x - p.x) < gap && Math.abs(q.y - (p.y + dy)) < gap) && k <= limit * 2; k++) dy = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * gap;
    out.push({ ...p, y: p.y + dy });
  }
  return out;
}

// People: steps against keypresses. The AI agent presses no keys, so it gets its own lane under the
// chart (same step axis) instead of piling up on the zero line.
export function Scatter({ rows, meta }) {
  const [wref, width] = useWidth();
  const [vref, seen] = useInView();
  const people = rows.filter((r) => r.persona !== 'agent');
  const agents = rows.filter((r) => r.persona === 'agent');
  const W = Math.max(280, width);
  const plotH = W < 560 ? 230 : 290;
  const lane = agents.length ? 100 : 0;
  const m = { l: 52, r: 26, t: 14, b: 46 };
  const H = m.t + plotH + lane + m.b;
  const xMax = niceMax(Math.max(10, ...rows.map((r) => r.steps)));
  const yMax = niceMax(Math.max(10, ...people.map((r) => r.keys)));
  const sx = (v) => m.l + (v / xMax) * (W - m.l - m.r);
  const sy = (v) => m.t + plotH - (v / yMax) * plotH;
  const laneTop = m.t + plotH + 16;
  const laneY = laneTop + 52;
  const placed = useMemo(() => [
    ...spread(people.map((r) => ({ r, x: sx(r.steps), y: sy(r.keys) }))),
    ...spread(agents.map((r) => ({ r, x: sx(r.steps), y: laneY })), 13, 2),
  ], [rows, W]);
  const xt = ticks(xMax, W < 560 ? 4 : 5);
  const yt = ticks(yMax, 4);
  const axisY = H - m.b;
  return (
    <div ref={(el) => { wref.current = el; vref.current = el; }} className="ax-scatter">
      {width > 0 && (
        <ChartBox>
          <svg width={W} height={H} role="group" aria-label={`Scatter plot of ${rows.length} runs: steps against keypresses for people, and a separate row for the AI agent`}>
            <g aria-hidden="true">
              {yt.map((t) => <g key={`y${t}`}><line className="ax-grid" x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} /><text className="ax-tick" x={m.l - 8} y={sy(t)} dy="0.32em" textAnchor="end">{t}</text></g>)}
              <line className="ax-axis" x1={m.l} x2={W - m.r} y1={sy(0)} y2={sy(0)} />
              {agents.length > 0 && (
                <>
                  <rect className="ax-lane" x={m.l} y={m.t + plotH + 16} width={W - m.l - m.r} height={lane - 16} rx={8} />
                  <text className="ax-lane-label" x={m.l + 10} y={laneTop + 17}>{W < 560 ? 'AI agent: no keys' : 'AI shopping agent: no keys, acts on elements'}</text>
                </>
              )}
              <line className="ax-axis" x1={m.l} x2={W - m.r} y1={axisY} y2={axisY} />
              {xt.map((t) => <text key={`x${t}`} className="ax-tick" x={sx(t)} y={axisY + 18} textAnchor="middle">{t}</text>)}
              <text className="ax-axis-label" x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">Steps (decisions)</text>
              <text className="ax-axis-label" transform={`translate(14 ${m.t + plotH / 2}) rotate(-90)`} textAnchor="middle">Keypresses (people)</text>
            </g>
            {placed.map(({ r, x, y }, i) => <Dot key={r.id} r={r} x={x} y={y} meta={meta} i={i} seen={seen} />)}
          </svg>
        </ChartBox>
      )}
    </div>
  );
}

export function scatterTakeaway(rows) {
  if (!rows.length) return 'No runs match these filters.';
  const ok = rows.filter((r) => outcomeShape(r.outcome) !== 'blocked');
  const bad = rows.filter((r) => outcomeShape(r.outcome) === 'blocked');
  const parts = [];
  if (ok.length) parts.push(`Runs that paid took a median of ${median(ok.map((r) => r.steps))} steps`);
  if (bad.length) parts.push(`blocked runs stopped after a median of ${median(bad.map((r) => r.steps))}`);
  const s = parts.join('; ');
  const agents = rows.filter((r) => r.persona === 'agent');
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.${agents.length ? ' The AI agent presses no keys, so its runs have their own row under the chart.' : ''}`;
}

function CondDot({ r, left, top, meta }) {
  const tip = useTip({ value: `${r.steps} steps`, label: outcomeLabel(r.outcome), lines: [r.persona === 'agent' ? 'No keys: acts on elements' : `${r.keys} keypresses`, 'Click to watch the replay'] });
  return (
    <a className="ax-cdot" href={`#/runs/${r.id}`} style={{ left: `${left}%`, top: `calc(50% + ${top}px)` }} aria-label={`${outcomeLabel(r.outcome)}, ${r.steps} steps. Open the replay`} {...tip}>
      <GlyphKey shape={outcomeShape(r.outcome)} />
    </a>
  );
}

export function Consistency({ a, meta }) {
  const [ref, seen] = useInView();
  const groups = conditions(a.runRows, meta);
  const max = niceMax(Math.max(10, ...a.runRows.filter((r) => !r.site).map((r) => r.steps)));
  const repeated = groups.filter((g) => g.runs.length > 1);
  const agree = repeated.filter((g) => g.agree).length;
  const takeaway = repeated.length
    ? `${repeated.length} of ${groups.length} demo-shop conditions ran more than once; in ${agree === repeated.length ? 'every one' : `${agree} of them`}, all repeats ended the same way.`
    : 'No condition has been repeated yet, so every number below comes from a single run.';
  const tk = ticks(max, 4);
  return (
    <Card wide title="Repeat runs: how stable each result is" takeaway={takeaway}
      note="Same customer type, same shop setup, run again with no memory of the earlier run. One mark per run, placed by its step count.">
      <ChartBox>
        <div className={`ax-conds ${seen ? 'in' : ''}`} ref={ref}>
          <div className="ax-cond ax-cond-axis" aria-hidden="true">
            <span />
            <span className="ax-cond-track">{tk.map((t) => <span key={t} className="ax-cond-tick" style={{ left: `${(t / max) * 100}%` }}>{t}</span>)}</span>
            <span />
          </div>
          {groups.map((g) => {
            // Runs closer than about 4% of the axis would overlap: stack them vertically instead.
            let prev = null, n = 0;
            const offsets = new Map([...g.runs].sort((x, y) => x.steps - y.steps).map((r) => {
              n = prev != null && r.steps - prev < max * 0.04 ? n + 1 : 0;
              prev = r.steps;
              return [r.id, n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 9];
            }));
            return (
              <div className="ax-cond" key={g.key}>
                <span className="ax-label">{g.label}</span>
                <span className="ax-cond-track">
                  {tk.map((t) => <i key={t} className="ax-cond-grid" style={{ left: `${(t / max) * 100}%` }} aria-hidden="true" />)}
                  {g.runs.map((r) => <CondDot key={r.id} r={r} left={(r.steps / max) * 100} top={offsets.get(r.id)} meta={meta} />)}
                </span>
                <span className="ax-val">{plural(g.runs.length, 'run')}</span>
              </div>
            );
          })}
        </div>
      </ChartBox>
      <DataTable caption="Repeat runs by condition" numeric={[1, 3]} head={['Condition', 'Runs', 'Outcomes', 'Steps (range)']}
        rows={groups.map((g) => [g.label, g.runs.length, [...new Set(g.runs.map((r) => outcomeLabel(r.outcome)))].join(', '), fmtRange(g.steps)])} />
    </Card>
  );
}

export function ScatterCard({ rows, meta }) {
  const shapes = ['paid', 'reached', 'blocked', 'wrong'].filter((s) => rows.some((r) => outcomeShape(r.outcome) === s));
  const names = { paid: 'Paid', reached: 'Reached payment', blocked: 'Blocked', wrong: 'Wrong item' };
  return (
    <Card wide title="Steps against keypresses" takeaway={scatterTakeaway(rows)} note="Each mark is one counted run. Click a mark to watch its replay.">
      <ul className="ax-legend" aria-label="Legend">{shapes.map((s) => <li key={s}><GlyphKey shape={s} />{names[s]}</li>)}</ul>
      <Scatter rows={rows} meta={meta} />
      <DataTable caption="Steps against keypresses" numeric={[4, 5]} head={['Customer', 'Defect', 'AI fix', 'Outcome', 'Steps', 'Keypresses']}
        rows={rows.map((r) => [personaLabel(meta, r.persona), defectLabel(meta, r.defect) || 'none', r.fixed ? 'Applied' : '—', outcomeLabel(r.outcome), r.steps, r.persona === 'agent' ? '—' : r.keys])} />
    </Card>
  );
}
