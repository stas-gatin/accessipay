// Defects: what the scanner saw against what customers met, one row per injected defect that was
// tested in the counted demo-shop runs. AG Grid (Enterprise); every value comes from recorded runs.
import React, { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { gridTheme, useTheme } from '../theme.js';
import { personaLabel, fmtRange, range } from './derive.js';
import { useMedia } from './kit.jsx';

function summarize(meta, runs) {
  const by = new Map();
  for (const r of runs) {
    if (!by.has(r.persona)) by.set(r.persona, []);
    by.get(r.persona).push(r);
  }
  const order = Object.keys(meta.personas || {});
  return [...by.entries()].sort((x, y) => order.indexOf(x[0]) - order.indexOf(y[0])).map(([p, list]) => {
    const paid = list.filter((r) => r.outcome === 'purchased');
    const word = paid.length === list.length ? `paid in ${paid.length} of ${list.length}` : paid.length === 0 ? `blocked in ${list.length} of ${list.length}` : `paid in ${paid.length} of ${list.length}`;
    const steps = paid.length === list.length ? `, ${fmtRange(range(paid.map((r) => r.steps)))} steps` : '';
    return { tone: paid.length === list.length ? 'ok' : 'bad', text: `${personaLabel(meta, p)}: ${word} ${list.length === 1 ? 'run' : 'runs'}${steps}` };
  });
}

function Lines({ value }) {
  if (!value?.length) return <span className="ax-grid-dim">Not run</span>;
  return (
    <ul className="ax-grid-lines">
      {value.map((l) => <li key={l.text} className={l.tone}><i aria-hidden="true" />{l.text}</li>)}
    </ul>
  );
}

function ScannerCell({ value }) {
  if (value == null) return <span className="ax-grid-dim">Not scanned</span>;
  return value === 0 ? <span className="pill muted">Found nothing</span> : <span className="pill warn">{value} issues</span>;
}

export default function DefectsGrid({ rows, meta }) {
  const t = useTheme();
  const narrow = useMedia('(max-width: 719px)');
  const data = useMemo(() => {
    const ids = [...new Set(rows.filter((r) => r.defect).map((r) => r.defect))];
    return ids.map((id) => {
      const d = meta.defects?.find((x) => x.id === id) || { id, short: id };
      const runs = rows.filter((r) => r.defect === id);
      const before = runs.filter((r) => !r.fixed);
      const after = runs.filter((r) => r.fixed);
      const scans = before.map((r) => r.scanner).filter((v) => v != null);
      return {
        id,
        short: d.short,
        title: d.title,
        wcag: d.wcag,
        scanner: scans.length ? Math.max(...scans) : null,
        before: summarize(meta, before),
        after: summarize(meta, after),
      };
    });
  }, [rows, meta]);

  const cols = [
    { field: 'short', headerName: 'Defect', minWidth: 170, flex: 1, wrapText: true, autoHeight: true, cellClass: 'wrap-cell ax-grid-strong' },
    { field: 'title', headerName: 'What is wrong', minWidth: 200, flex: 1.6, wrapText: true, autoHeight: true, cellClass: 'wrap-cell' },
    { field: 'wcag', headerName: 'WCAG', minWidth: 130, flex: 0.9, wrapText: true, autoHeight: true, cellClass: 'wrap-cell' },
    { field: 'scanner', headerName: 'axe-core', width: 164, cellRenderer: ScannerCell },
    { field: 'before', headerName: 'Customers, as built', minWidth: 210, flex: 1.4, autoHeight: true, cellClass: 'wrap-cell', cellRenderer: Lines, sortable: false },
    { field: 'after', headerName: 'After the AI fix', minWidth: 210, flex: 1.4, autoHeight: true, cellClass: 'wrap-cell', cellRenderer: Lines, sortable: false },
  ];

  if (!data.length) return <p className="ax-empty">No injected defects in the counted runs yet.</p>;
  // Phone: one card per defect, nothing cut at the right edge.
  if (narrow) {
    return (
      <ul className="ax-cards">
        {data.map((d) => (
          <li key={d.id} className="ax-defcard">
            <b>{d.short}</b>
            <span className="ax-defcard-what">{d.title}</span>
            <span className="ax-defcard-meta">WCAG {d.wcag} · axe-core: <ScannerCell value={d.scanner} /></span>
            <span className="ax-defcard-h">Customers, as built</span>
            <Lines value={d.before} />
            <span className="ax-defcard-h">After the AI fix</span>
            <Lines value={d.after} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <AgGridReact
      theme={gridTheme(t)}
      rowData={data}
      columnDefs={cols}
      defaultColDef={{ sortable: true, resizable: true, suppressHeaderMenuButton: true, wrapHeaderText: true, autoHeaderHeight: true }}
      domLayout="autoHeight"
      getRowId={(p) => p.data.id}
    />
  );
}
