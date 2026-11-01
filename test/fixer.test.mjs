// The fix loop without AI: a blocked run, a hand-written patch reply, and a re-run that purchases.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../server/app.mjs';
import { parseFix } from '../server/fixer/fixer.mjs';

let browser, server, ctx;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accessipay-fix-'));

before(async () => {
  browser = await chromium.launch();
  const port = 4800 + Math.floor(Math.random() * 400);
  ctx = createApp({ browser, dataDir, origin: `http://127.0.0.1:${port}`, env: {} });
  await new Promise((ok) => { server = ctx.app.listen(port, ok); });
});
after(async () => { server?.close(); await browser?.close(); });

const PURCHASE = JSON.parse(fs.readFileSync(new URL('./fixtures/agent-purchase.json', import.meta.url), 'utf8'));

async function finished(id) {
  for (let i = 0; i < 600; i++) {
    const r = ctx.runs.get(id);
    if (r.status === 'finished') return r;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error('run did not finish');
}

test('parseFix tolerates prose around the JSON', () => {
  const r = parseFix('Here you go:\n```json\n{"summary":"s","patches":[{"find":"a","replace":"b"}]}\n```');
  assert.equal(r.patches.length, 1);
});

test('a blocked run, a patch for the div button, and a re-run that buys', async () => {
  const blocked = await finished(ctx.runs.start({ persona: 'agent', brain: 'scripted', script: PURCHASE, defects: ['div-pay-button'] }).id);
  assert.equal(blocked.outcome.status, 'blocked');

  const job = ctx.fixes.start({ runId: blocked.id, fixer: 'external' });
  assert.equal(job.page, 'pay');
  assert.match(job.prompt, /<div class="btn primary" id="pay-button">/);

  const reply = JSON.stringify({
    summary: 'Use a real submit button.',
    patches: [
      { find: '<div class="btn primary" id="pay-button">Pay $54.00</div>', replace: '<button type="submit" class="primary" id="pay-button">Pay $54.00</button>', why: 'native button' },
      { find: "document.getElementById('pay-button').addEventListener('click', pay);", replace: '', why: 'the form submit handler already pays' },
      { find: 'this text is not on the page', replace: 'x', why: 'should be rejected' },
    ],
  });
  const r = ctx.fixes.submit(job.id, reply);
  assert.equal(r.ok, true);
  assert.equal(r.job.accepted.length, 2);
  assert.equal(r.job.rejected.length, 1);
  assert.match(r.job.diff, /\+\s*<p><button type="submit" class="primary" id="pay-button">/);

  const rerun = await finished(ctx.runs.start({ persona: 'agent', brain: 'scripted', script: PURCHASE, instanceId: blocked.instanceId }).id);
  assert.equal(rerun.outcome.status, 'purchased');
  assert.equal(rerun.payment.status, 'COMPLETED');
});
