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

const AGENT_PURCHASE = [
  { action: 'click', args: { role: 'button', name: 'Add Trail Backpack to cart' } },
  { action: 'click', args: { role: 'link', name: 'Cart (1)' } },
  { action: 'click', args: { role: 'button', name: 'Close' } },
  { action: 'click', args: { role: 'link', name: 'Checkout' } },
  { action: 'fill', args: { name: 'Full name', text: 'Alex Morgan' } },
  { action: 'fill', args: { name: 'Email', text: 'alex.morgan@example.com' } },
  { action: 'fill', args: { name: 'Street address', text: '12 Market Street' } },
  { action: 'fill', args: { name: 'City', text: 'Springfield' } },
  { action: 'fill', args: { name: 'ZIP or postal code', text: '62701' } },
  { action: 'select', args: { name: 'Country', option: 'United States' } },
  { action: 'check', args: { role: 'radio', name: 'Standard delivery, 3 to 5 days, $5.00' } },
  { action: 'check', args: { role: 'checkbox', name: 'I agree to the terms of sale' } },
  { action: 'click', args: { role: 'button', name: 'Continue to payment' } },
  { action: 'fill', args: { name: 'Name on card', text: 'Alex Morgan' } },
  { action: 'fill', args: { name: 'Card number', text: '4111 1111 1111 1111' } },
  { action: 'fill', args: { name: 'Expiry date (MM/YY)', text: '12/30' } },
  { action: 'fill', args: { name: 'Security code', text: '123' } },
  { action: 'click', args: { role: 'button', name: 'Pay $54.00' } },
  { action: 'done', args: {} },
];

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
