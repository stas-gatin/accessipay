import React, { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { api } from './api.js';
import { gridTheme, useTheme } from './theme.js';

function YesNo({ value, node }) {
  if (node?.group) return null;
  if (value == null) return <span className="note">not run yet</span>;
  return value ? <span className="pill ok">found</span> : <span className="pill bad">missed</span>;
}

export default function Defects({ meta }) {
  const t = useTheme();
  const [evalData, setEval] = useState(undefined);
  useEffect(() => { api('/api/eval').then(setEval).catch(() => setEval(null)); }, []);

  const rows = useMemo(() => meta.defects.map((d) => {
    const e = evalData?.defects?.[d.id];
    return {
      ...d,
      axe: e ? e.axeFound : null,
      agent: e ? e.agentFound : null,
      blocked: e ? e.blockedPersonas?.join(', ') || 'none' : null,
      fixedBy: e ? e.fixed : null,
    };
  }), [meta, evalData]);

  const cols = [
    { field: 'page', headerName: 'Page', rowGroup: true, hide: true },
    { field: 'short', headerName: 'Defect', flex: 1.2, minWidth: 210, wrapText: true, autoHeight: true, cellClass: 'wrap-cell', cellStyle: { fontWeight: 600 } },
    { field: 'title', headerName: 'What is wrong', flex: 2.2, minWidth: 300, wrapText: true, autoHeight: true, cellClass: 'wrap-cell' },
    { field: 'wcag', headerName: 'WCAG', flex: 1.3, minWidth: 190, wrapText: true, autoHeight: true, cellClass: 'wrap-cell' },
    { field: 'split', headerName: 'Set', width: 100 },
    { field: 'axe', headerName: 'axe-core', width: 130, cellRenderer: YesNo },
    { field: 'agent', headerName: 'AccessiPay', width: 130, cellRenderer: YesNo },
  ];

  const s = evalData?.summary;
  return (
    <div className="page">
      <h1>Defects and results</h1>
      <p className="lead">
        Twelve real checkout mistakes. The train set was used while building the shopper prompts; the holdout set was not looked at until the evaluation.
        A defect counts as found when it blocks a purchase or the shopper reports it on the right page.
      </p>
      {s && (
        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div className="card"><p className="note">axe-core found</p><p className="big-number">{s.axeFound} of {s.total}</p></div>
          <div className="card"><p className="note">AccessiPay found</p><p className="big-number ok">{s.agentFound} of {s.total}</p><p className="note">{s.ci}</p></div>
          <div className="card"><p className="note">Holdout set only</p><p className="big-number">{s.holdoutAgent} vs {s.holdoutAxe} of {s.holdoutTotal}</p><p className="note">AccessiPay vs axe-core</p></div>
        </div>
      )}
      {evalData === null && <p className="callout note">The evaluation has not been run yet, so only the catalog is shown.</p>}
      <div className="grid-box" style={{ marginTop: 12 }}>
        <AgGridReact theme={gridTheme(t)} rowData={rows} columnDefs={cols} groupDefaultExpanded={1} defaultColDef={{ sortable: true, resizable: true }} autoGroupColumnDef={{ headerName: 'Page', minWidth: 150, valueFormatter: (p) => (p.value ? p.value[0].toUpperCase() + p.value.slice(1) : '') }} />
      </div>
      {evalData?.method && <p className="note" style={{ marginTop: 10 }}>{evalData.method}</p>}
    </div>
  );
}
