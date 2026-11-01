// Every demo-shop run in one AG Grid (Enterprise): sort any column, group by customer or outcome
// (buttons, or drag a column header into the group bar), click a row to watch the replay.
// Any run left out of the figures (mock payment, did not start) would be listed and labelled, never hidden.
// On a phone the same runs are cards, so no column is cut off.
import React, { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { gridTheme, useTheme } from '../theme.js';
import { personaLabel, defectLabel, fmtSeconds } from './derive.js';
import { useMedia } from './kit.jsx';

const OUT = {
  paid: ['Paid', 'ok'],
  blocked: ['Blocked', 'bad'],
  wrong: ['Wrong item', 'warn'],
  mock: ['Paid, mock payment', 'muted'],
  none: ['Did not start', 'muted'],
};

function outcomeKey(r) {
  if (r.notStarted) return 'none';
  if (r.mock) return 'mock';
  if (r.outcome === 'purchased') return 'paid';
  if (r.outcome === 'wrong-item') return 'wrong';
  return 'blocked';
}

function OutcomeCell({ value, data, node }) {
  if (node?.group || !data) return value ?? null;
  const [, tone] = OUT[data.outKey];
  return <span className={`pill ${tone}`}>{value}</span>;
}

function ReplayCell({ data, node }) {
  if (node?.group || !data) return null;
  return <a className="ax-grid-link" href={`#/runs/${data.id}`} onClick={(e) => e.stopPropagation()}>Replay<span className="sr-only">: {data.customer}, {data.defectName}, {data.outcomeText}</span> <span aria-hidden="true">→</span></a>;
}

export default function RunsTable({ rows, meta }) {
  const t = useTheme();
  const [groupBy, setGroupBy] = useState('persona');
  const narrow = useMedia('(max-width: 719px)');
  const data = useMemo(() => rows.map((r) => {
    const outKey = outcomeKey(r);
    return {
      id: r.id,
      outKey,
      customer: personaLabel(meta, r.persona),
      defectName: defectLabel(meta, r.defect) || 'None (clean shop)',
      version: r.fixed ? 'After AI fix' : 'As built',
      outcomeText: outKey === 'blocked' ? `Blocked at ${r.furthestStage}` : OUT[outKey][0],
      outcomeGroup: OUT[outKey][0],
      steps: r.notStarted ? null : r.steps,
      keys: r.notStarted || r.persona === 'agent' ? null : r.keys,
      deadEnds: r.notStarted ? null : r.deadEnds,
      klm: outKey === 'paid' ? r.klmSeconds : null,
      createdAt: r.createdAt,
    };
  }), [rows, meta]);

  const blank = (p) => p.node?.group;
  const cols = useMemo(() => [
    { field: 'customer', headerName: 'Customer', minWidth: 170, flex: 1, enableRowGroup: true, rowGroup: groupBy === 'persona', hide: groupBy === 'persona' },
    { field: 'outcomeGroup', headerName: 'Outcome', enableRowGroup: true, rowGroup: groupBy === 'outcome', hide: true },
    { field: 'defectName', headerName: 'Injected defect', minWidth: 190, flex: 2, wrapText: true, autoHeight: true, cellClass: 'wrap-cell', enableRowGroup: true },
    { field: 'version', headerName: 'Shop', width: 108, enableRowGroup: true },
    { field: 'outcomeText', headerName: 'Outcome', width: 210, cellRenderer: OutcomeCell },
    { field: 'steps', headerName: 'Steps', width: 76, type: 'numericColumn', valueFormatter: (p) => (blank(p) ? '' : p.value ?? '—') },
    { field: 'keys', headerName: 'Keys', width: 76, type: 'numericColumn', valueFormatter: (p) => (blank(p) ? '' : p.value == null ? '—' : p.value.toLocaleString('en-US')) },
    { field: 'deadEnds', headerName: 'Failed', headerTooltip: 'Failed actions: the control was missing or could not be used', width: 80, type: 'numericColumn', valueFormatter: (p) => (blank(p) ? '' : p.value ?? '—') },
    { field: 'klm', headerName: 'Est. time for a person', headerTooltip: 'Estimated time for a person following the recorded path (keystroke-level model). Not measured time.', width: 128, wrapHeaderText: true, autoHeaderHeight: true, type: 'numericColumn', valueFormatter: (p) => (blank(p) ? '' : p.value == null ? '—' : fmtSeconds(p.value)) },
    { field: 'createdAt', headerName: 'Recorded', hide: true, sort: 'desc' },
    { colId: 'replay', headerName: 'Replay', width: 100, sortable: false, resizable: false, cellRenderer: ReplayCell },
  ], [groupBy]);

  const groups = [['persona', 'Customer'], ['outcome', 'Outcome'], ['none', 'Nothing']];
  const buttons = (
    <div className="ax-grouping" role="group" aria-label="Group runs by">
      <span>Group by</span>
      {groups.map(([v, l]) => (
        <button key={v} type="button" className="btn small" aria-pressed={groupBy === v} onClick={() => setGroupBy(v)}>{l}</button>
      ))}
    </div>
  );

  // Phone: one card per run, grouped the same way, so nothing is cut at the right edge.
  if (narrow) {
    const key = (d) => (groupBy === 'persona' ? d.customer : groupBy === 'outcome' ? d.outcomeGroup : '');
    const sorted = [...data].sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
    const heads = [...new Set(sorted.map(key))];
    return (
      <div className="ax-runsgrid">
        {buttons}
        {heads.map((h) => {
          const list = sorted.filter((d) => key(d) === h);
          return (
            <section key={h || 'all'} className="ax-cards-group" aria-label={h || 'All runs'}>
              {h && <h4 className="ax-cards-h">{h} <span>({list.length})</span></h4>}
              <ul className="ax-cards">
                {list.map((d) => (
                  <li key={d.id}>
                    <a className="ax-runcard" href={`#/runs/${d.id}`}>
                      <span className="ax-runcard-top">
                        <b>{groupBy === 'persona' ? d.defectName : d.customer}</b>
                        <span className={`pill ${OUT[d.outKey][1]}`}>{d.outcomeText}</span>
                      </span>
                      <span className="ax-runcard-sub">{groupBy === 'persona' ? d.version : `${d.defectName} · ${d.version}`}</span>
                      <span className="ax-runcard-nums">
                        <span><b>{d.steps ?? '—'}</b> steps</span>
                        <span><b>{d.keys == null ? '—' : d.keys.toLocaleString('en-US')}</b> keys</span>
                        <span><b>{d.deadEnds ?? '—'}</b> failed</span>
                        {d.klm != null && <span><b>{fmtSeconds(d.klm)}</b> est. for a person</span>}
                      </span>
                      <span className="ax-runcard-go">Watch replay <span aria-hidden="true">→</span></span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="ax-runsgrid">
      {buttons}
      <AgGridReact
        theme={gridTheme(t)}
        rowData={data}
        columnDefs={cols}
        defaultColDef={{ sortable: true, resizable: true, suppressHeaderMenuButton: true }}
        groupDisplayType="groupRows"
        groupDefaultExpanded={-1}
        rowGroupPanelShow="always"
        domLayout="autoHeight"
        getRowId={(p) => p.data.id}
        rowClass="ax-grid-row"
        onRowClicked={(e) => { if (e.data) location.hash = `#/runs/${e.data.id}`; }}
      />
    </div>
  );
}
