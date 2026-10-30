// Every run as a dot (steps against keypresses, shape and colour by outcome), a sortable table with
// every per-run metric, and how stable results are across repeat runs of the same condition.
import React, { useMemo, useState } from 'react';
import { ChartBox, Card, DataTable, GlyphKey, OutcomeGlyph, useInView, useTip, useWidth } from './kit.jsx';
import { niceMax, ticks, median, personaLabel, defectLabel, outcomeLabel, outcomeTone, outcomeShape, shortId, shopLabel, fmtSeconds, fmtRange, conditions, plural } from './derive.js';

export function RunFilters({ meta, rows, persona, setPersona, shop, setShop }) {
  const personas = Object.keys(meta.personas || {}).filter((p) => rows.some((r) => r.persona === p));
  return (
    <div className="ax-filters" role="group" aria-label="Filter runs">
      <label>
        <span>Customer type</span>
        <select value={persona} onChange={(e) => setPersona(e.target.value)}>
          <option value="all">All customer types</option>
          {personas.map((p) => <option key={p} value={p}>{personaLabel(meta, p)}</option>)}
        </select>
      </label>
      <label>
        <span>Shop</span>
        <select value={shop} onChange={(e) => setShop(e.target.value)}>
          <option value="all">Demo shop and real sites</option>
          <option value="demo">Demo shop only</option>
          <option value="real">Real sites only</option>
        </select>
      </label>
    </div>
  );
}

export function useRunFilter(rows) {
  const [persona, setPersona] = useState('all');
  const [shop, setShop] = useState('all');
  const filtered = useMemo(() => rows.filter((r) => (persona === 'all' || r.persona === persona) && (shop === 'all' || (shop === 'demo' ? !r.site : !!r.site))), [rows, persona, shop]);
  return { persona, setPersona, shop, setShop, filtered };
}

function Dot({ r, x, y, meta, i, seen }) {
  const label = `Run ${shortId(r.id)}, ${personaLabel(meta, r.persona)}, ${shopLabel(r)}: ${outcomeLabel(r.outcome)}, ${r.steps} steps, ${r.keys} keypresses`;
  const tip = useTip({ value: `${r.steps} steps · ${r.keys} keypresses`, label: `${outcomeLabel(r.outcome)} · ${personaLabel(meta, r.persona)}`, lines: [`${shopLabel(r)}${r.defect ? `, ${defectLabel(meta, r.defect)}` : ''}${r.fixed ? ', after AI fix' : ''}`, `Run ${shortId(r.id)}: click to open`] });
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

export function Scatter({ rows, meta }) {
  const [wref, width] = useWidth();
  const [vref, seen] = useInView();
  const W = Math.max(280, width);
  const H = W < 560 ? 280 : 340;
  const m = { l: 52, r: 26, t: 14, b: 46 };
  const xMax = niceMax(Math.max(10, ...rows.map((r) => r.steps)));
  const yMax = niceMax(Math.max(10, ...rows.map((r) => r.keys)));
  const sx = (v) => m.l + (v / xMax) * (W - m.l - m.r);
  const sy = (v) => H - m.b - (v / yMax) * (H - m.t - m.b);
  // Runs with identical values would hide each other: nudge them apart sideways (the tooltip keeps exact values).
  const placed = useMemo(() => {
    const seenAt = new Map();
    return rows.map((r) => {
      const k = `${r.steps}|${r.keys}`;
      const n = seenAt.get(k) || 0;
      seenAt.set(k, n + 1);
      return { r, dx: n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 10 };
    });
  }, [rows]);
  const xt = ticks(xMax, W < 560 ? 4 : 5);
  const yt = ticks(yMax, 4);
  return (
    <div ref={(el) => { wref.current = el; vref.current = el; }} className="ax-scatter">
      {width > 0 && (
        <ChartBox>
          <svg width={W} height={H} role="group" aria-label={`Scatter plot of ${rows.length} runs: steps against keypresses`}>
            <g aria-hidden="true">
              {yt.map((t) => <g key={`y${t}`}><line className="ax-grid" x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} /><text className="ax-tick" x={m.l - 8} y={sy(t)} dy="0.32em" textAnchor="end">{t}</text></g>)}
              {xt.map((t) => <text key={`x${t}`} className="ax-tick" x={sx(t)} y={H - m.b + 18} textAnchor="middle">{t}</text>)}
              <line className="ax-axis" x1={m.l} x2={W - m.r} y1={sy(0)} y2={sy(0)} />
              <text className="ax-axis-label" x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">Steps (decisions)</text>
              <text className="ax-axis-label" transform={`translate(14 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle">Keypresses</text>
            </g>
            {placed.map(({ r, dx }, i) => <Dot key={r.id} r={r} x={sx(r.steps) + dx} y={sy(r.keys)} meta={meta} i={i} seen={seen} />)}
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
  if (ok.length) parts.push(`Runs that paid or reached payment took a median of ${median(ok.map((r) => r.steps))} steps`);
  if (bad.length) parts.push(`blocked runs stopped after a median of ${median(bad.map((r) => r.steps))}`);
  const s = parts.join('; ');
  const agents = rows.filter((r) => r.persona === 'agent');
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.${agents.length ? ' AI agent runs sit on the bottom line: the agent acts on elements, not keys.' : ''}`;
}

const COLS = [
  { k: 'id', h: 'Run', v: (r) => shortId(r.id) },
  { k: 'persona', h: 'Customer' },
  { k: 'site', h: 'Shop' },
  { k: 'defect', h: 'Injected defect' },
  { k: 'fixed', h: 'AI fix' },
  { k: 'outcome', h: 'Outcome' },
  { k: 'furthestStage', h: 'Reached' },
  { k: 'steps', h: 'Steps', num: true },
  { k: 'keys', h: 'Keypresses', num: true },
  { k: 'tabShare', h: 'Steps moving focus', num: true },
  { k: 'deadEnds', h: 'Dead ends', num: true },
  { k: 'noEffect', h: 'Changed nothing', num: true },
  { k: 'longestStall', h: 'Longest stall', num: true },
  { k: 'mostRepeatedState', h: 'Most repeated screen', num: true },
  { k: 'klmSeconds', h: 'Time to pay (estimate)', num: true },
  { k: 'scanner', h: 'axe-core issues', num: true },
];
const STAGE_RANK = { Browse: 0, Cart: 1, Checkout: 2, Payment: 3, Paid: 4 };

export function RunTable({ rows, meta }) {
  const [sort, setSort] = useState({ k: 'steps', dir: -1 });
  const sorted = useMemo(() => {
    const val = (r) => (sort.k === 'furthestStage' ? STAGE_RANK[r.furthestStage] : sort.k === 'persona' ? personaLabel(meta, r.persona) : sort.k === 'site' ? shopLabel(r) : r[sort.k]);
    return [...rows].sort((x, y) => {
      const a = val(x), b = val(y);
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return (typeof a === 'number' ? a - b : String(a).localeCompare(String(b))) * sort.dir;
    });
  }, [rows, sort, meta]);
  const cell = (r, c) => {
    switch (c.k) {
      case 'id': return <a href={`#/runs/${r.id}`}>{shortId(r.id)}</a>;
      case 'persona': return personaLabel(meta, r.persona);
      case 'site': return shopLabel(r);
      case 'defect': return defectLabel(meta, r.defect) || 'none';
      case 'fixed': return r.fixed ? 'Applied' : '—';
      case 'outcome': return <span className={`pill ${outcomeTone(r.outcome)}`}>{outcomeLabel(r.outcome)}</span>;
      case 'tabShare': return r.persona === 'agent' ? '—' : `${r.tabShare}%`;
      case 'klmSeconds': return r.klmSeconds == null ? 'none' : fmtSeconds(r.klmSeconds);
      case 'scanner': return r.scanner ?? 'not scanned';
      default: return r[c.k];
    }
  };
  return (
    <div className="ax-scroll ax-runtable" role="region" aria-label="All runs with every metric" tabIndex={0}>
      <table>
        <caption className="sr-only">All runs with every metric. Column headers sort the table.</caption>
        <thead>
          <tr>
            {COLS.map((c) => (
              <th key={c.k} scope="col" className={c.num ? 'num' : ''} aria-sort={sort.k === c.k ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                <button type="button" onClick={() => setSort((s) => ({ k: c.k, dir: s.k === c.k ? -s.dir : c.num ? -1 : 1 }))}>
                  {c.h}<span aria-hidden="true" className="ax-sortmark">{sort.k === c.k ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              {COLS.map((c, j) => (j === 0
                ? <th key={c.k} scope="row">{cell(r, c)}</th>
                : <td key={c.k} className={c.num ? 'num' : ''}>{cell(r, c)}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CondDot({ r, left, top, meta }) {
  const tip = useTip({ value: `${r.steps} steps`, label: `${outcomeLabel(r.outcome)} · run ${shortId(r.id)}`, lines: [`${r.keys} keypresses`] });
  return (
    <a className="ax-cdot" href={`#/runs/${r.id}`} style={{ left: `${left}%`, top: `calc(50% + ${top}px)` }} aria-label={`Run ${shortId(r.id)}: ${outcomeLabel(r.outcome)}, ${r.steps} steps`} {...tip}>
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
      <DataTable caption="Repeat runs by condition" numeric={[1, 3]} head={['Condition', 'Runs', 'Outcomes', 'Steps (range)', 'Run ids']}
        rows={groups.map((g) => [g.label, g.runs.length, [...new Set(g.runs.map((r) => outcomeLabel(r.outcome)))].join(', '), fmtRange(g.steps), g.runs.map((r) => shortId(r.id)).join(', ')])} />
    </Card>
  );
}

export function ScatterCard({ rows, meta }) {
  const shapes = ['paid', 'reached', 'blocked', 'wrong'].filter((s) => rows.some((r) => outcomeShape(r.outcome) === s));
  const names = { paid: 'Paid', reached: 'Reached payment (real site, stopped there)', blocked: 'Blocked', wrong: 'Wrong item' };
  return (
    <Card wide title="Every run: steps against keypresses" takeaway={scatterTakeaway(rows)} note="Each mark is one run. Click a mark to open the run step by step.">
      <ul className="ax-legend" aria-label="Legend">{shapes.map((s) => <li key={s}><GlyphKey shape={s} />{names[s]}</li>)}</ul>
      <Scatter rows={rows} meta={meta} />
      <DataTable caption="Every run: steps against keypresses" numeric={[4, 5]} head={['Run', 'Customer', 'Shop', 'Outcome', 'Steps', 'Keypresses']}
        rows={rows.map((r) => [shortId(r.id), personaLabel(meta, r.persona), shopLabel(r), outcomeLabel(r.outcome), r.steps, r.keys])} />
    </Card>
  );
}
