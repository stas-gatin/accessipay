// Owner reports without AI: a scripted run blocked by the div Pay button, the culprit found in it,
// a hand-written fix, the ready-code export (git-applicable patch), a re-run, and the report pages.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { createApp } from '../server/app.mjs';
import { findCulprit, tagOf, selectorOf, checkoutState, renderAsCustomerGot } from '../server/report/culprit.mjs';
import { exportFix } from '../server/fixer/export.mjs';
import { layoutMarks, annotationSvg } from '../shared/annotate.js';

let browser, server, ctx, base;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accessipay-report-'));

before(async () => {
  browser = await chromium.launch();
  const port = 5200 + Math.floor(Math.random() * 400);
  base = `http://127.0.0.1:${port}`;
  ctx = createApp({ browser, dataDir, origin: base, env: {} });
  await new Promise((ok) => { server = ctx.app.listen(port, ok); });
});
after(async () => { server?.close(); await browser?.close(); });

const PURCHASE = JSON.parse(fs.readFileSync(new URL('./fixtures/agent-purchase.json', import.meta.url), 'utf8'));
const FIND = '<p><div class="btn primary" id="pay-button">Pay $54.00</div></p>';

async function finished(id) {
  for (let i = 0; i < 600; i++) {
    const r = ctx.runs.get(id);
    if (r.status === 'finished') return ctx.runs.plain(r);
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error('run did not finish');
}

test('the most specific tag of a patch gives the selector', () => {
  assert.equal(selectorOf(tagOf(FIND)), '#pay-button');
  assert.equal(selectorOf(tagOf('<div class="modal">')), 'div.modal');
  assert.equal(selectorOf(tagOf('<h2>Get 10% off</h2>')), 'h2 (text "Get 10% off")');
  assert.equal(tagOf("if (e.key === 'Escape') { return; }"), null);
});

test('annotation places the label inside the image and draws an arrow', () => {
  const marks = [{ n: 1, kind: 'blocker', box: { x: 233, y: 782, width: 112, height: 44 }, title: 'Pay button is a <div>', note: '"Pay $54.00" is a <div> with no role.' }, { kind: 'scanner', box: { x: 10, y: 10, width: 50, height: 20 } }];
  const [m] = layoutMarks({ width: 1280, height: 860, marks }).filter((x) => x.label);
  assert.ok(m.label.x >= 0 && m.label.y >= 0 && m.label.x + m.label.w <= 1280 && m.label.y + m.label.h <= 860);
  assert.ok(m.arrow);
  const svg = annotationSvg({ width: 1280, height: 860, marks });
  assert.match(svg, /ANALYSIS/);
  assert.match(svg, /stroke-dasharray="10 6"/);
});

let blocked, job, rerun;

test('culprit of a blocked run: the Pay "button" is a <div> Tab cannot reach', async () => {
  blocked = await finished(ctx.runs.start({ persona: 'agent', brain: 'scripted', script: PURCHASE, defects: ['div-pay-button'] }).id);
  assert.equal(blocked.outcome.status, 'blocked');
  const target = blocked.events.find((e) => e.type === 'target' && e.missing);
  assert.equal(target?.name, 'Pay $54.00');

  const c = await findCulprit({ run: blocked, shop: ctx.shop, browser, origin: base, dataDir });
  assert.equal(c.source, 'missing');
  assert.equal(c.page, 'pay');
  const el = c.elements.find((e) => e.n === c.primary);
  assert.equal(el.tag, 'div');
  assert.equal(el.name, 'Pay $54.00');
  assert.equal(el.role, '');
  assert.equal(el.focusable, false);
  assert.ok(el.box.width > 20 && el.box.height > 10);
  assert.ok(fs.existsSync(c.image.file));
});

test('culprit from the accepted patch, the ready-code export, and the case report', async () => {
  job = ctx.fixes.start({ runId: blocked.id, fixer: 'external' });
  const reply = { summary: 'Use a real submit button.', patches: [{ find: FIND, replace: '<p><button type="submit" class="btn primary" id="pay-button">Pay $54.00</button></p>', why: 'native button' }] };
  assert.equal(ctx.fixes.submit(job.id, JSON.stringify(reply)).ok, true);
  job = ctx.fixes.get(job.id);

  const c = await findCulprit({ run: blocked, fix: job, shop: ctx.shop, browser, origin: base, dataDir });
  assert.equal(c.source, 'fix');
  assert.equal(c.confidence, 'Confirmed in DOM');
  const el = c.elements.find((e) => e.n === c.primary);
  assert.equal(el.selector, '#pay-button');
  assert.equal(el.tag, 'div');
  assert.doesNotMatch(el.outer, /data-ap-culprit/);

  rerun = await finished(ctx.runs.start({ persona: 'agent', brain: 'scripted', script: PURCHASE, instanceId: blocked.instanceId, label: `re-run after fix ${job.id}` }).id);
  assert.equal(rerun.outcome.status, 'purchased');

  const ex = exportFix({ job, run: blocked, rerun, shop: ctx.shop });
  assert.match(ex.patch, /^diff --git a\/pages\/pay\.html b\/pages\/pay\.html$/m);
  assert.match(ex.patch, /^--- a\/pages\/pay\.html$/m);
  assert.match(ex.patch, /^\+\+\+ b\/pages\/pay\.html$/m);
  assert.match(ex.patch, /map it to your template/);
  assert.equal(ex.json.changes.length, 1);
  const ch = ex.json.changes[0];
  assert.match(ch.wcag, /2\.1\.1/);
  assert.equal(ch.verifiedBy.runId, rerun.id);
  assert.equal(ch.verifiedBy.paypalOrderId, rerun.payment.orderId);
  assert.ok(ch.line > 1);
  assert.match(ex.md, /## 1\. `#pay-button`/);

  // The patch applies with git to the page as the customer received it.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'accessipay-patch-'));
  fs.mkdirSync(path.join(repo, 'pages'));
  const inst = { id: job.instanceId, defects: blocked.defects, patches: [], created: Date.now(), ...checkoutState() };
  fs.writeFileSync(path.join(repo, 'pages', 'pay.html'), renderAsCustomerGot({ shop: ctx.shop, run: blocked, inst, page: 'pay', base: `/s/${job.instanceId}` }));
  fs.writeFileSync(path.join(repo, 'fix.patch'), ex.patch);
  execFileSync('git', ['apply', 'fix.patch'], { cwd: repo });
  assert.match(fs.readFileSync(path.join(repo, 'pages', 'pay.html'), 'utf8'), /<button type="submit" class="btn primary" id="pay-button">/);

  const page = await (await fetch(`${base}/report/case/${blocked.id}`)).text();
  assert.match(page, /impossible → possible/);
  assert.match(page, /may not meet <a [^>]*>2\.1\.1 Keyboard/);
  assert.match(page, new RegExp(rerun.payment.orderId));
  assert.doesNotMatch(page.replace(/&quot;faster&quot;/g, ''), /faster/i);
  const patch = await fetch(`${base}/api/fixes/${job.id}/fix.patch`);
  assert.equal(patch.status, 200);
  assert.match(await patch.text(), /^diff --git a\/pages\/pay\.html/m);
});

test('the case PDF is tagged and has an outline', async () => {
  const res = await fetch(`${base}/api/report/case/${blocked.id}.pdf`);
  assert.equal(res.status, 200);
  const s = Buffer.from(await res.arrayBuffer()).toString('latin1');
  assert.ok(s.startsWith('%PDF'));
  assert.ok(s.includes('/StructTreeRoot'));
  assert.ok(s.includes('/Outlines'));
});
