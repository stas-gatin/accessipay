// End-to-end checks of the shop and the run engine, without any AI: scripted brains only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../server/app.mjs';

let browser, server, ctx, origin;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accessipay-test-'));

before(async () => {
  browser = await chromium.launch();
  const port = 4400 + Math.floor(Math.random() * 400);
  origin = `http://127.0.0.1:${port}`;
  ctx = createApp({ browser, dataDir, origin, env: {} });
  await new Promise((ok) => { server = ctx.app.listen(port, ok); });
});
after(async () => { server?.close(); await browser?.close(); });

const AGENT_PURCHASE = JSON.parse(fs.readFileSync(new URL('./fixtures/agent-purchase.json', import.meta.url), 'utf8'));

async function finished(id) {
  for (let i = 0; i < 300; i++) {
    const r = ctx.runs.get(id);
    if (r.status === 'finished') return r;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error('run did not finish');
}

test('a clean shop can be bought by the agent persona, and the oracle confirms it', async () => {
  const rec = ctx.runs.start({ persona: 'agent', brain: 'scripted', script: AGENT_PURCHASE });
  const r = await finished(rec.id);
  assert.equal(r.outcome.status, 'purchased', JSON.stringify(r.events.filter((e) => e.type === 'act').map((e) => e.result)));
  assert.equal(r.payment.status, 'COMPLETED');
  assert.equal(r.payment.mode, 'mock');
});

test('the same script is blocked when the Pay button is a div', async () => {
  const rec = ctx.runs.start({ persona: 'agent', brain: 'scripted', script: AGENT_PURCHASE, defects: ['div-pay-button'] });
  const r = await finished(rec.id);
  assert.equal(r.outcome.status, 'blocked');
  const last = r.events.filter((e) => e.type === 'act').at(-1).result;
  assert.match(last, /did not work/);
});

test('every page of a clean shop is clean for axe-core', async () => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const inst = ctx.shop.create({});
  inst.cart = [{ sku: 'bp-01', name: 'Trail Backpack', price: 49, qty: 1 }];
  inst.shipping = { name: 'Alex Morgan', email: 'a@b.co', street: 'x', city: 'y', zip: '1', country: 'US', delivery: 'standard' };
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const p of ['/', '/cart', '/checkout', '/pay']) {
    await page.goto(`${origin}/s/${inst.id}${p}`);
    await page.waitForTimeout(500);
    const r = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(r.violations.map((v) => `${p} ${v.id}`), []);
  }
  await context.close();
});

test('agentic buyer: the right product counts, the wrong one is reported as wrong-item', async () => {
  const right = JSON.parse(fs.readFileSync(new URL('./fixtures/agentic-purchase.json', import.meta.url), 'utf8'));
  const ok = await finished(ctx.runs.start({ persona: 'agent', brain: 'scripted', script: right, goalId: 'agentic' }).id);
  assert.equal(ok.outcome.status, 'purchased', ok.outcome.reason);
  assert.equal(ok.goalCheck.met, true);
  const wrong = await finished(ctx.runs.start({ persona: 'agent', brain: 'scripted', script: AGENT_PURCHASE, goalId: 'agentic' }).id);
  assert.equal(wrong.outcome.status, 'wrong-item');
  assert.equal(wrong.goalCheck.met, false);
});
