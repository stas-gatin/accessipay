import React, { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { themeQuartz } from 'ag-grid-community';
import { api, OUTCOME } from './api.js';

export const theme = themeQuartz.withParams({ accentColor: '#0b4f6c', headerFontWeight: 700, fontSize: 14, borderRadius: 8, wrapperBorderRadius: 12 });

function OutcomeCell({ value }) {
  const o = OUTCOME[value];
  return o ? <span className={`pill ${o.tone}`}>{o.label}</span> : <span className="pill muted">{value || 'running'}</span>;
}

// Master/detail: what the shopper reported and how the payment ended.
function RunDetail({ data }) {
  return (
    <div style={{ padding: '12px 20px', lineHeight: 1.5 }}>
      <p style={{ margin: '0 0 6px' }}><strong>Why:</strong> {data.outcome?.reason || '—'}</p>
      {data.payment && <p style={{ margin: '0 0 6px' }}><strong>PayPal {data.payment.mode === 'mock' ? '(mock)' : 'sandbox'}:</strong> order {data.payment.orderId}, {data.payment.status}</p>}
      {data.findings?.length ? (
        <ul className="findings">{data.findings.map((f, i) => <li key={i}><strong>{f.page}:</strong> {f.problem}</li>)}</ul>
      ) : <p className="note" style={{ margin: 0 }}>No findings reported.</p>}
      <p style={{ margin: '8px 0 0' }}><a href={`#/runs/${data.id}`}>Open the run step by step</a></p>
    </div>
  );
}

export default function RunsGrid({ meta }) {
  const [rows, setRows] = useState(null);
  const [groupBy, setGroupBy] = useState('scenario');
  useEffect(() => { api('/api/runs').then(setRows).catch(() => setRows([])); }, []);

  const data = useMemo(() => (rows || []).map((r) => ({
    ...r,
    personaLabel: meta.personas[r.persona]?.label || r.persona,
    scenario: r.defects?.length ? r.defects.map((d) => meta.defects.find((x) => x.id === d)?.title || d).join(' + ') : 'Clean shop',
    fixed: r.patches?.length ? 'After fix' : 'Before fix',
    brain: r.brainKind === 'anthropic' ? `Claude API · ${r.model}` : r.brainKind === 'external' ? 'Claude Code agent' : r.brainKind,
    outcomeStatus: r.outcome?.status,
    scanViolations: r.scan?.totalViolations,
    cost: r.usage?.costUsd,
  })), [rows, meta]);

  const cols = useMemo(() => [
    { field: 'scenario', headerName: 'Shop', flex: 2, minWidth: 220, rowGroup: groupBy === 'scenario', hide: groupBy === 'scenario', enableRowGroup: true },
    { field: 'personaLabel', headerName: 'Shopper', flex: 1, minWidth: 160, rowGroup: groupBy === 'persona', hide: groupBy === 'persona', enableRowGroup: true },
    { field: 'fixed', headerName: 'Fix', width: 120, enableRowGroup: true },
    { field: 'scanViolations', headerName: 'axe-core violations', width: 160, type: 'numericColumn' },
    { field: 'outcomeStatus', headerName: 'Outcome', width: 130, cellRenderer: OutcomeCell, enableRowGroup: true },
    { field: 'steps', headerName: 'Steps', width: 90, type: 'numericColumn' },
    { field: 'brain', headerName: 'Decided by', flex: 1, minWidth: 170 },
    { field: 'cost', headerName: 'API cost', width: 110, valueFormatter: (p) => (p.value == null ? '' : `$${p.value.toFixed(3)}`) },
    { field: 'createdAt', headerName: 'Started', width: 170, sort: 'desc', valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString() : '') },
  ], [groupBy]);

  return (
    <div className="page">
      <h1>Runs</h1>
      <p className="lead">Every run, grouped the way you choose. Expand a row to see what the shopper reported; drag a column header into the bar to regroup.</p>
      <div className="row" style={{ marginBottom: 10 }} role="group" aria-label="Group runs by">
        <span className="note">Group by</span>
        {[['scenario', 'Shop'], ['persona', 'Shopper'], ['none', 'Nothing']].map(([v, l]) => (
          <button key={v} type="button" className="btn small" aria-pressed={groupBy === v} onClick={() => setGroupBy(v)} style={groupBy === v ? { background: 'var(--brand)', color: '#fff' } : undefined}>{l}</button>
        ))}
      </div>
      <div className="grid-box">
        {rows === null ? <p className="empty">Loading…</p> : (
          <AgGridReact
            theme={theme}
            rowData={data}
            columnDefs={cols}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
            autoGroupColumnDef={{ headerName: groupBy === 'persona' ? 'Shopper' : 'Shop', minWidth: 280, cellRendererParams: { suppressCount: false } }}
            groupDefaultExpanded={1}
            rowGroupPanelShow="always"
            masterDetail
            detailRowAutoHeight
            detailCellRenderer={RunDetail}
            onRowDoubleClicked={(e) => e.data && (location.hash = `#/runs/${e.data.id}`)}
            getRowId={(p) => p.data.id}
          />
        )}
      </div>
      <p className="note">Double-click a run to open it.</p>
    </div>
  );
}
