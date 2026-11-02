// An AI fixer whose first reply quotes the HTML wrongly gets the reasons back and tries again.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../server/app.mjs';

let browser, server, ctx;
const prompts = [];
const replies = [
  { summary: 'Use a real button.', patches: [{ find: '<div class="btn primary" id="pay-button" role="presentation">Pay $54.00</div>', replace: '<button type="submit" id="pay-button">Pay $54.00</button>', why: 'native button' }] },
  { summary: 'Use a real button.', patches: [{ find: '<div class="btn primary" id="pay-button">Pay $54.00</div>', replace: '<button type="submit" class="btn primary" id="pay-button">Pay $54.00</button>', why: 'native button' }] },
];
const fakeFixer = () => ({ kind: 'fake', async propose(prompt) { prompts.push(prompt); return replies[prompts.length - 1]; } });

before(async () => {
  browser = await chromium.launch();
  const port = 5200 + Math.floor(Math.random() * 400);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accessipay-fixretry-'));
  ctx = createApp({ browser, dataDir, origin: `http://127.0.0.1:${port}`, env: {}, fixers: { fake: fakeFixer } });
  await new Promise((ok) => { server = ctx.app.listen(port, ok); });
});
after(async () => { server?.close(); await browser?.close(); });

const PURCHASE = JSON.parse(fs.readFileSync(new URL('./fixtures/agent-purchase.json', import.meta.url), 'utf8'));
async function until(fn) {
  for (let i = 0; i < 600; i++) { const v = fn(); if (v) return v; await new Promise((ok) => setTimeout(ok, 100)); }
  throw new Error('timed out');
}

test('a rejected patch goes back to the fixer, and the second reply is applied', async () => {
  const run = ctx.runs.start({ persona: 'agent', brain: 'scripted', script: PURCHASE, defects: ['div-pay-button'] });
  await until(() => ctx.runs.get(run.id).status === 'finished');
  const job = ctx.fixes.start({ runId: run.id, fixer: 'fake' });
  assert.ok(job.preview.length > 5, 'the page lines to show while the fixer reads');
  await until(() => job.status === 'applied');
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /text not found/);
  assert.match(prompts[1], /character for character/);
  assert.equal(job.accepted.length, 1);
  assert.equal(job.rejected.length, 0);
  assert.equal(job.retries.length, 1);
  assert.equal(job.stage, 'done');
});
