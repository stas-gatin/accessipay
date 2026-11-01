// PDF of a report page (Chromium print, tagged and with an outline, A4) and the baked annotated PNG.
// One job at a time: each one opens a browser context, and memory on the host is small.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { annotationSvg, reportMarks } from '../../shared/annotate.js';

let queue = Promise.resolve();
function oneAtATime(fn) {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

export function pdfKey(parts) {
  return crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

export function renderPdf({ browser, origin, kind, id, file }) {
  return oneAtATime(async () => {
    if (fs.existsSync(file)) return file;
    const context = await browser.newContext({ viewport: { width: 1000, height: 1400 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    try {
      const res = await page.goto(`${origin}/report/${kind}/${encodeURIComponent(id)}?print=1`, { waitUntil: 'networkidle', timeout: 120000 });
      if (!res || !res.ok()) throw new Error(`The report page answered ${res ? res.status() : 'nothing'}`);
      await page.emulateMedia({ media: 'print' });
      await page.evaluate(() => document.fonts.ready);
      const pdf = await page.pdf({
        format: 'A4', printBackground: true, tagged: true, outline: true, preferCSSPageSize: true,
        margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: '<div style="font:8px Inter,Helvetica,sans-serif;width:100%;text-align:center;color:#4a586b">AccessiPay owner report · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, pdf);
      return file;
    } finally {
      await context.close().catch(() => {});
    }
  });
}

// The screenshot with its marks drawn in, as one PNG (for downloads, the PDF gallery, Devpost).
// Drawn like the report page and the console: title-only callout, ellipse round the whole element.
export function bakePng({ browser, imageFile, width, height, marks: given, file }) {
  const { onPicture: marks } = reportMarks({ width, height, marks: given });
  return oneAtATime(async () => {
    if (fs.existsSync(file)) return file;
    const mime = /\.png$/i.test(imageFile) ? 'image/png' : 'image/jpeg';
    const data = `data:${mime};base64,${fs.readFileSync(imageFile).toString('base64')}`;
    const svg = annotationSvg({ width, height, marks, image: data, idPrefix: 'bake' });
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    try {
      await page.setContent(`<!doctype html><html><body style="margin:0"><div id="f" style="width:${width}px;height:${height}px">${svg}</div></body></html>`);
      await page.waitForTimeout(100);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await page.locator('#f').screenshot({ path: file, type: 'png' });
      return file;
    } finally {
      await context.close().catch(() => {});
    }
  });
}
