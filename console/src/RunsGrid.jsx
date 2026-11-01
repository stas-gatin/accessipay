import React, { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { gridTheme, useTheme } from './theme.js';
import { api, OUTCOME } from './api.js';



function OutcomeCell({ value, node }) {
  if (node?.group) return null;
  const o = OUTCOME[value];
  return o ? <span className={`pill ${o.tone}`}>{o.label}</span> : <span className="pill muted">{value || 'running'}</span>;
}

// Master/detail: what the shopper reported and how the payment ended.
function RunDetail({ data }) {
  return (
    <div style={{ padding: '12px 20px', lineHeight: 1.5 }}>
      <p style={{ margin: '0 0 6px' }}><strong>Why:</strong> {data.outcome?.reason || '—'}</p>
      {data.payment && <p style={{ margin: '0 0 6px' }}><strong>PayPal {data.payment.mode === 'mock' ? '(mock)' : data.payment.mode === 'owner-sandbox' ? 'sandbox of the shop' : 'sandbox'}:</strong> order {data.payment.orderId}, {data.payment.status}</p>}
      {data.findings?.length ? (
        <ul className="findings">{data.findings.map((f, i) => <li key={i}><strong>{f.page}:</strong> {f.problem}</li>)}</ul>
      ) : <p className="note" style={{ margin: 0 }}>No findings reported.</p>}
      <p style={{ margin: '8px 0 0' }}><a href={`#/runs/${data.id}`}>Open the run step by step</a></p>
    </div>
  );
}

export default function RunsGrid({ meta }) {
  const t = useTheme();
  const [rows, setRows] = useState(null);
  const [groupBy, setGroupBy] = useState('scenario');
  // Real sites first: they are what the history is for. The demo shop has its own view.
  const [where, setWhere] = useState(() => (location.hash.includes('demo') ? 'demo' : 'real'));
  useEffect(() => { api('/api/runs').then(setRows).catch(() => setRows([])); }, []);
  const realCount = (rows || []).filter((r) => r.site).length;
  const demoCount = (rows || []).length - realCount;

  const data = useMemo(() => (rows || []).filter((r) => (where === 'real' ? !!r.site : !r.site)).map((r) => ({
    ...r,
    personaLabel: meta.personas[r.persona]?.label || r.persona,
    scenario: r.site ? r.site.host : r.defects?.length ? r.defects.map((d) => meta.defects.find((x) => x.id === d)?.short || d).join(' + ') : 'Clean shop',
    fixed: r.patches?.length ? 'After AI fix' : 'As built',
    brain: r.brainKind === 'anthropic' ? `Claude API · ${r.model}` : r.brainKind === 'external' ? 'Claude Code agent' : r.brainKind,
    outcomeStatus: r.outcome?.status,
    scanViolations: r.scan?.totalViolations,
    cost: r.usage?.costUsd,
  })), [rows, meta, where]);

  const cols = useMemo(() => [
    { field: 'scenario', headerName: where === 'real' ? 'Site' : 'Defect', flex: 2, minWidth: 220, rowGroup: groupBy === 'scenario', hide: groupBy === 'scenario', enableRowGroup: true },
    { field: 'personaLabel', headerName: 'Shopper', flex: 1, minWidth: 200, rowGroup: groupBy === 'persona', hide: groupBy === 'persona', enableRowGroup: true },
    { field: 'fixed', headerName: 'Version', width: 140, enableRowGroup: true, hide: where === 'real' },
    { field: 'scanViolations', headerName: 'Scanner', width: 130, type: 'numericColumn', valueFormatter: (p) => (p.value == null ? '' : `${p.value} found`) },
    { field: 'outcomeStatus', headerName: 'Outcome', width: 150, cellRenderer: OutcomeCell, enableRowGroup: true },
    { field: 'steps', headerName: 'Steps', width: 110, type: 'numericColumn' },
    { field: 'brain', headerName: 'Decided by', flex: 1, minWidth: 190 },
    { field: 'cost', headerName: 'API cost', width: 120, valueFormatter: (p) => (p.value == null ? '—' : `$${p.value.toFixed(3)}`) },
    { field: 'createdAt', headerName: 'Started', width: 180, sort: 'desc', valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '') },
  ], [groupBy, where]);

  return (
    <div className="page">
      <p className="eyebrow"><a href="#/results">Results</a></p>
      <h1>Every run</h1>
      <p className="lead">Each attempt by one customer on one site. For the whole analysis of a site, with all three customers together, open it in <a href="#/results">Results</a>.</p>
      <div className="runs-where" role="tablist" aria-label="Which runs">
        <button type="button" role="tab" aria-selected={where === 'real'} className={where === 'real' ? 'on' : ''} onClick={() => setWhere('real')}>
          <b>Real sites</b><span>{rows ? `${realCount} runs on ${new Set(rows.filter((r) => r.site).map((r) => r.site.host)).size} sites` : '…'}</span>
        </button>
        <button type="button" role="tab" aria-selected={where === 'demo'} className={where === 'demo' ? 'on' : ''} onClick={() => setWhere('demo')}>
          <b>Our demo shop</b><span>{rows ? `${demoCount} runs, deliberate defects, PayPal sandbox` : '…'}</span>
        </button>
      </div>
      <div className="row" style={{ marginBottom: 10 }} role="group" aria-label="Group runs by">
        <span className="note">Group by</span>
        {[['scenario', where === 'real' ? 'Site' : 'Defect'], ['persona', 'Shopper'], ['none', 'Nothing']].map(([v, l]) => (
          <button key={v} type="button" className="btn small" aria-pressed={groupBy === v} onClick={() => setGroupBy(v)} >{l}</button>
        ))}
      </div>
      <div className="grid-box">
        {rows === null ? <p className="empty">Loading…</p> : (
          <AgGridReact
            theme={gridTheme(t)}
            rowData={data}
            columnDefs={cols}
            defaultColDef={{ sortable: true, filter: true, resizable: true, suppressHeaderMenuButton: true }}
            key={where}
            autoGroupColumnDef={{ headerName: groupBy === 'persona' ? 'Shopper' : where === 'real' ? 'Site' : 'Demo shop defect', minWidth: 330, flex: 1.8, cellRendererParams: { suppressCount: false } }}
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
      <p className="note">Double-click a run to open it.{where === 'real' ? ' Retailers are shown as Retailer A, B, and so on, without names or screenshots.' : ''}</p>
    </div>
  );
}
