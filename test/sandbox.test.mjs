// End-to-end purchase against the real PayPal sandbox. Skipped when the sandbox keys are not in .env.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createApp, loadEnv } from '../server/app.mjs';

loadEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'));
const hasKeys = !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
// In the sandbox the payment page uses PayPal Card Fields, whose fields carry PayPal's own names.
const PURCHASE = JSON.parse(fs.readFileSync(new URL('./fixtures/agent-purchase-sdk.json', import.meta.url), 'utf8'));

let browser, server, ctx;
before(async () => {
  if (!hasKeys) return;
  browser = await chromium.launch();
  const port = 5200 + Math.floor(Math.random() * 300);
  ctx = createApp({ browser, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'accessipay-sbx-')), origin: `http://127.0.0.1:${port}`, env: process.env });
  await new Promise((ok) => { server = ctx.app.listen(port, ok); });
});
after(async () => { server?.close(); await browser?.close(); });

test('a purchase in the shop creates a COMPLETED order in the PayPal sandbox', { skip: !hasKeys && 'no PayPal sandbox keys' }, async () => {
  const rec = ctx.runs.start({ persona: 'agent', brain: 'scripted', script: PURCHASE });
  let r;
  for (let i = 0; i < 900; i++) {
    r = ctx.runs.get(rec.id);
    if (r.status === 'finished') break;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  assert.equal(r.status, 'finished');
  assert.equal(r.outcome.status, 'purchased', r.outcome.reason);
  assert.equal(r.payment.mode, 'sandbox');
  assert.equal(r.payment.status, 'COMPLETED');
  assert.match(r.payment.orderId, /^[A-Z0-9]{17}$/);
  assert.equal(ctx.shop.get(r.instanceId).order.via, 'paypal-js-sdk');

  // Leave the sandbox tidy: refund the capture.
  const inst = ctx.shop.get(r.instanceId);
  const refund = await ctx.paypal.refund(inst.order.captureId);
  assert.equal(refund.status, 'COMPLETED');
});
