// An owner's staging shop on their own PayPal sandbox, end to end: verify the domain, let the browser
// through the bot protection, connect the sandbox, and a customer pays. The pass is the order that the
// owner's sandbox reports as COMPLETED. Skipped when the sandbox keys are not in .env.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createApp, loadEnv } from '../server/app.mjs';
import { createSandboxShop } from '../examples/sandbox-shop/server.mjs';
import { orderIdsIn } from '../server/engine/run.mjs';
import { sandboxOracle } from '../server/engine/runs.mjs';

loadEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'));
const hasKeys = !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

const BUY = [
  { action: 'click', args: { role: 'button', name: 'Add Rain Shell to cart' } },
  { action: 'click', args: { role: 'link', name: 'Checkout' } },
  { action: 'fill', args: { name: 'Full name', text: 'Alex Morgan' } },
  { action: 'fill', args: { name: 'Email', text: 'alex.morgan@example.com' } },
  { action: 'fill', args: { name: 'Phone', text: '(212) 555-0142' } },
  { action: 'fill', args: { name: 'Street address', text: '100 Example Avenue' } },
  { action: 'fill', args: { name: 'City', text: 'New York' } },
  { action: 'fill', args: { name: 'State', text: 'New York' } },
  { action: 'fill', args: { name: 'ZIP code', text: '10001' } },
  { action: 'click', args: { role: 'button', name: 'Continue to payment' } },
  { action: 'fill', args: { name: 'Cardholder Name (optional)', text: 'Alex Morgan' } },
  { action: 'fill', args: { name: 'Card number', text: '4111 1111 1111 1111' } },
  { action: 'fill', args: { name: 'MM / YY', text: '12/30' } },
  { action: 'fill', args: { name: 'CVV', text: '123' } },
  { action: 'click', args: { role: 'button', name: 'Pay $85.00' } },
  { action: 'done', args: {} },
];

test('order ids are read from PayPal URLs and from a shop answer', () => {
  assert.deepEqual(orderIdsIn('https://www.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T/confirm-payment-source'), ['5O190127TN364715T']);
  assert.deepEqual(orderIdsIn('https://www.sandbox.paypal.com/checkoutnow?token=8AB12345CD678901E&x=1'), ['8AB12345CD678901E']);
  assert.deepEqual(orderIdsIn('{"id":"8AB12345CD678901E","status":"CREATED"}', /"(?:id|orderID)"\s*:\s*"([A-Z0-9]{17})"/g), ['8AB12345CD678901E']);
  assert.deepEqual(orderIdsIn('https://example.com/orders/123'), []);
});

test('the sandbox oracle counts only a COMPLETED order created during the run', async () => {
  const now = Date.now();
  const book = {
    OLD00000000000001: { id: 'OLD00000000000001', status: 'COMPLETED', create_time: new Date(now - 3600e3).toISOString() },
    NEW00000000000001: { id: 'NEW00000000000001', status: 'APPROVED', create_time: new Date(now).toISOString() },
  };
  const paypalFor = () => ({ getOrder: async (id) => { if (!book[id]) throw new Error('404'); return book[id]; } });
  const orderIds = new Set(['OLD00000000000001', 'NOPE0000000000001']);
  const o = sandboxOracle({ keys: {}, startedAt: now, orderIds, paypalFor });
  assert.equal(await o.check(), false, 'an order from before the run does not count');
  orderIds.add('NEW00000000000001');
  assert.equal(await o.check(), false, 'APPROVED is not paid');
  book.NEW00000000000001 = { ...book.NEW00000000000001, status: 'COMPLETED', purchase_units: [{ amount: { value: '85.00', currency_code: 'USD' } }] };
  assert.equal(await o.check(), true);
  assert.deepEqual(o.payment(), { mode: 'owner-sandbox', orderId: 'NEW00000000000001', status: 'COMPLETED', amount: 85, currency: 'USD', createdAt: book.NEW00000000000001.create_time });
});

let browser, server, shopServer, ctx, base, shopUrl, shopEnv, shop;
before(async () => {
  if (!hasKeys) return;
  browser = await chromium.launch();
  const port = 5600 + Math.floor(Math.random() * 300);
  base = `http://127.0.0.1:${port}`;
  ctx = createApp({ browser, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'accessipay-own-')), origin: base, env: { ...process.env, ACCESSIPAY_LOCAL_SITES: '1' } });
  await new Promise((ok) => { server = ctx.app.listen(port, ok); });
  shopEnv = { ...process.env };
  shop = createSandboxShop({ env: shopEnv });
  const shopPort = port + 1000;
  shopUrl = `http://localhost:${shopPort}/`;
  await new Promise((ok) => { shopServer = shop.app.listen(shopPort, ok); });
});
after(async () => { server?.close(); shopServer?.close(); await browser?.close(); });

const api = async (p, body, method = body ? 'POST' : 'GET') => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json() };
};

test('a customer pays on the owner\'s staging shop and the owner\'s PayPal sandbox confirms it', { skip: !hasKeys && 'no PayPal sandbox keys', timeout: 240000 }, async () => {
  // 1. The owner adds the shop and proves it is theirs with the file.
  const site = (await api('/api/owner-sites', { url: shopUrl })).json;
  assert.equal(site.verified, false);
  shopEnv.ACCESSIPAY_VERIFY = site.verifyFile.content;
  assert.equal((await api(`/api/owner-sites/${site.id}/verify`, {})).json.verified, true);

  // 2. The bot protection goes on; the owner's allow rule lets the access key through.
  shopEnv.ACCESS_KEY = site.access.key;
  const check = (await api(`/api/owner-sites/${site.id}/check`, {})).json;
  assert.ok(check.withoutKey.wall, 'without the key the browser is turned away');
  assert.equal(check.withKey.wall, null);

  // 3. The PayPal sandbox: wrong keys are refused, the sandbox app's keys connect, and the secret is never shown.
  const bad = await api(`/api/owner-sites/${site.id}/sandbox`, { url: shopUrl, clientId: 'not-a-client', secret: 'not-a-secret' });
  assert.equal(bad.status, 400);
  const elsewhere = await api(`/api/owner-sites/${site.id}/sandbox`, { url: 'https://example.org/', clientId: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET });
  assert.equal(elsewhere.status, 400, 'the staging checkout must be on the verified domain');
  const conn = await api(`/api/owner-sites/${site.id}/sandbox`, { url: shopUrl, clientId: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET });
  assert.equal(conn.status, 200, conn.json.error);
  assert.equal(conn.json.sandbox.clientId, process.env.PAYPAL_CLIENT_ID);
  assert.ok(!JSON.stringify(conn.json).includes(process.env.PAYPAL_CLIENT_SECRET), 'the secret is not sent back');

  // 4. The customer buys and pays with the PayPal test card.
  const rec = ctx.runs.start({ persona: 'agent', brain: 'scripted', script: BUY, url: shopUrl, ownerSiteId: site.id, payInSandbox: true });
  let r;
  for (let i = 0; i < 2000; i++) {
    r = ctx.runs.get(rec.id);
    if (r.status === 'finished') break;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  assert.equal(r.status, 'finished');
  assert.equal(r.outcome.status, 'purchased', `${r.outcome.reason} ${JSON.stringify(r.events.filter((e) => e.type === 'guard' || e.type === 'act').map((e) => e.blocked || e.result).slice(-6))}`);
  assert.equal(r.payment.mode, 'owner-sandbox');
  assert.equal(r.payment.status, 'COMPLETED');
  assert.equal(r.payment.amount, 85);
  assert.deepEqual(r.payment.sdkClientIds, [process.env.PAYPAL_CLIENT_ID]);
  const order = shop.orders.get(r.payment.orderId);
  assert.ok(order, 'the order AccessiPay counted is the one the shop took');
  assert.equal(order.status, 'COMPLETED');
  assert.ok(!r.events.some((e) => e.type === 'guard'), 'nothing was blocked');

  // Leave the sandbox tidy.
  assert.equal((await shop.paypal.refund(order.captureId)).status, 'COMPLETED');
});

test('without the sandbox connected, a run on the same shop stops at payment and may not pay', { skip: !hasKeys && 'no PayPal sandbox keys' }, async () => {
  const sites = await api('/api/owner-sites', { url: shopUrl });
  const del = await api(`/api/owner-sites/${sites.json.id}/sandbox`, undefined, 'DELETE');
  assert.equal(del.json.sandbox, null);
  assert.throws(() => ctx.runs.start({ persona: 'agent', brain: 'scripted', script: BUY, url: shopUrl, ownerSiteId: sites.json.id, payInSandbox: true }), /Connect your PayPal sandbox/);
});

test('a checkout whose PayPal SDK uses another client id cannot send a payment', { skip: !hasKeys && 'no PayPal sandbox keys', timeout: 120000 }, async () => {
  // A page on the same verified shop that loads PayPal with a client id that is not the connected sandbox app.
  shop.app.get('/other-pay', (req, res) => res.send(`<!doctype html><html lang="en"><title>Pay</title><h1>Payment</h1>
<script src="https://www.paypal.com/sdk/js?client-id=SOMEONE-ELSES-LIVE-APP"></script>
<button onclick="fetch('https://api-m.paypal.com/v2/checkout/orders', { method: 'POST', body: '{}' }).catch(function () {}); document.title = 'Sent'">Pay $85.00</button>`));
  const site = (await api('/api/owner-sites', { url: shopUrl })).json;
  await api(`/api/owner-sites/${site.id}/sandbox`, { url: shopUrl, clientId: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET });
  const rec = ctx.runs.start({ persona: 'agent', brain: 'scripted', url: `${shopUrl}other-pay`, ownerSiteId: site.id, payInSandbox: true,
    script: [{ action: 'click', args: { role: 'button', name: 'Pay $85.00' } }, { action: 'done', args: {} }] });
  let r;
  for (let i = 0; i < 1200; i++) {
    r = ctx.runs.get(rec.id);
    if (r.status === 'finished') break;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  const guards = r.events.filter((e) => e.type === 'guard').map((e) => e.blocked);
  assert.ok(guards.some((g) => /POST api-m\.paypal\.com: this checkout's PayPal client id is not the connected sandbox app/.test(g)), JSON.stringify(guards));
  assert.notEqual(r.outcome.status, 'purchased');
  assert.deepEqual(r.payment.sdkClientIds, ['SOMEONE-ELSES-LIVE-APP']);
});
