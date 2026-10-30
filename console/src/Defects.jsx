import React, { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { api } from './api.js';
import { theme } from './RunsGrid.jsx';

function YesNo({ value }) {
  if (value == null) return <span className="note">not measured</span>;
  return value ? <span className="pill ok">found</span> : <span className="pill bad">missed</span>;
}

export default function Defects({ meta }) {
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
    { field: 'title', headerName: 'Defect', flex: 3, minWidth: 320, wrapText: true, autoHeight: true },
    { field: 'wcag', headerName: 'WCAG', flex: 1.4, minWidth: 180, wrapText: true, autoHeight: true },
    { field: 'split', headerName: 'Set', width: 100 },
    { field: 'axe', headerName: 'axe-core', width: 120, cellRenderer: YesNo },
    { field: 'agent', headerName: 'AccessiPay', width: 130, cellRenderer: YesNo },
    { field: 'blocked', headerName: 'Purchase blocked for', flex: 1.2, minWidth: 180 },
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
          <div className="card"><p className="section-title">axe-core found</p><p className="big-number">{s.axeFound} of {s.total}</p></div>
          <div className="card"><p className="section-title">AccessiPay found</p><p className="big-number ok">{s.agentFound} of {s.total}</p><p className="note">{s.ci}</p></div>
          <div className="card"><p className="section-title">Holdout only</p><p className="big-number">{s.holdoutAgent} vs {s.holdoutAxe} of {s.holdoutTotal}</p><p className="note">AccessiPay vs axe-core</p></div>
        </div>
      )}
      {evalData === null && <p className="callout note">The evaluation has not been run yet, so only the catalog is shown.</p>}
      <div className="grid-box" style={{ marginTop: 12 }}>
        <AgGridReact theme={theme} rowData={rows} columnDefs={cols} groupDefaultExpanded={1} defaultColDef={{ sortable: true, resizable: true }} autoGroupColumnDef={{ headerName: 'Page', minWidth: 160 }} />
      </div>
      {evalData?.method && <p className="note" style={{ marginTop: 10 }}>{evalData.method}</p>}
    </div>
  );
}
