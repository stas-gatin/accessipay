// Owner reports: annotated screenshots, ready code, report pages and PDFs. Mounted from app.mjs.
//   GET /report/run/:id, /report/case/:runId, /report/site/:runId    report pages (HTML)
//   GET /api/report/:kind/:id.json | .pdf                            report data, PDF (cached in data/reports/)
//   GET /api/report/:kind/:id/figure-:n.png                          annotated screenshot, baked
//   GET /api/fixes/:id/fix.patch | changes.json | changes.md         ready code from a fix job

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, REPORT_VERSION } from './model.mjs';
import { reportHtml, errorHtml } from './html.mjs';
import { renderPdf, bakePng, pdfKey } from './pdf.mjs';
import { exportFix } from '../fixer/export.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KINDS = new Set(['run', 'case', 'site']);
const ID = /^[\w-]{1,64}$/;

export function mountReports(app, ctx) {
  const { runs, fixes, browser, origin, dataDir } = ctx;
  const reportsDir = path.join(dataDir, 'reports');
  fs.mkdirSync(path.join(reportsDir, 'files'), { recursive: true });

  const fontDir = (pkg) => path.join(root, 'node_modules', '@fontsource', pkg, 'files');
  app.use('/report/assets/fonts', express.static(fontDir('inter'), { maxAge: '30d' }));
  app.use('/report/assets/fonts', express.static(fontDir('jetbrains-mono'), { maxAge: '30d' }));
  app.use('/report/files', express.static(path.join(reportsDir, 'files'), { maxAge: '1h' }));

  const plain = (id) => { const r = runs.get(id); return r ? (r.brain ? runs.plain(r) : r) : null; };
  const fail = (res, e, html = false) => {
    const status = e.status || 500;
    if (status >= 500) console.error('report:', e);
    return html ? res.status(status).type('html').send(errorHtml(status, e.message)) : res.status(status).json({ error: e.message });
  };

  // Report pages.
  app.get('/report/:kind/:id', async (req, res) => {
    const { kind, id } = req.params;
    if (!KINDS.has(kind) || !ID.test(id)) return res.status(404).type('html').send(errorHtml(404, 'No such report.'));
    try {
      const r = await buildReport({ kind, id, ctx });
      res.set('cache-control', 'no-cache').type('html').send(reportHtml(r, { print: req.query.print === '1' }));
    } catch (e) { fail(res, e, true); }
  });

  // Report data for the console.
  app.get('/api/report/:kind/:file', async (req, res, next) => {
    const { kind, file } = req.params;
    const m = file.match(/^([\w-]{1,64})\.(json|pdf)$/);
    if (!KINDS.has(kind) || !m) return next();
    const [, id, ext] = m;
    try {
      const r = await buildReport({ kind, id, ctx });
      if (ext === 'json') return res.json(r);
      // The cache key covers everything the PDF shows: the runs, the fix and the report version.
      const key = pdfKey([REPORT_VERSION, r.kind, r.id, r.fix?.id || null, r.rerun?.id || null, r.findings?.length || null]);
      const out = path.join(reportsDir, 'pdf', `${r.kind}-${r.id}-${key}.pdf`);
      if (req.query.fresh === '1') fs.rmSync(out, { force: true });
      await renderPdf({ browser, origin, kind: r.kind, id: r.id, file: out });
      res.set('content-disposition', `attachment; filename="accessipay-${r.kind}-${r.id}.pdf"`);
      res.type('application/pdf').sendFile(out);
    } catch (e) { fail(res, e); }
  });

  // Annotated screenshot as one PNG.
  app.get('/api/report/:kind/:id/:figure', async (req, res, next) => {
    const { kind, id, figure } = req.params;
    const m = figure.match(/^figure-(\d{1,3})\.png$/);
    if (!KINDS.has(kind) || !ID.test(id) || !m) return next();
    try {
      const r = await buildReport({ kind, id, ctx });
      const n = Number(m[1]);
      const item = (r.blockers || r.findings || []).find((b) => b.n === n);
      if (!item?.figure) return res.status(404).json({ error: 'No figure with this number' });
      const src = item.figure.src;
      const imageFile = src.startsWith('/report/files/')
        ? path.join(reportsDir, 'files', path.basename(src))
        : [path.join(dataDir, 'runs', r.id, path.basename(src)), path.join(dataDir, 'recorded', r.id, path.basename(src))].find((f) => fs.existsSync(f));
      if (!imageFile || !fs.existsSync(imageFile)) return res.status(404).json({ error: 'Screenshot not found' });
      const key = pdfKey([REPORT_VERSION, src, item.figure.marks]);
      const out = path.join(reportsDir, 'files', `annotated-${r.id}-${n}-${key}.png`);
      await bakePng({ browser, imageFile, width: item.figure.width, height: item.figure.height, marks: item.figure.marks, file: out });
      res.set('content-disposition', `inline; filename="accessipay-${r.id}-figure-${n}.png"`);
      res.type('image/png').sendFile(out);
    } catch (e) { fail(res, e); }
  });

  // Ready code from a fix job.
  app.get('/api/fixes/:id/:file', (req, res, next) => {
    const { id, file } = req.params;
    if (!['fix.patch', 'changes.json', 'changes.md'].includes(file)) return next();
    const job = fixes.get(id);
    if (!job) return res.status(404).json({ error: 'not found' });
    try {
      const run = plain(job.runId);
      const rerunSummary = runs.list().filter((r) => (r.label || '').includes(`fix ${job.id}`) && r.status === 'finished').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      const rerun = rerunSummary ? plain(rerunSummary.id) : null;
      const ex = exportFix({ job, run, rerun, shop: ctx.shop });
      const inline = req.query.inline === '1';
      const disp = (name) => res.set('content-disposition', `${inline ? 'inline' : 'attachment'}; filename="${name}"`);
      if (file === 'fix.patch') { disp(`accessipay-${job.id}.patch`); return res.type('text/x-diff; charset=utf-8').send(ex.patch); }
      if (file === 'changes.md') { disp(`accessipay-${job.id}-changes.md`); return res.type('text/markdown; charset=utf-8').send(ex.md); }
      if (!inline) disp(`accessipay-${job.id}-changes.json`);
      return res.json(ex.json);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
}
