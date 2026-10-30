// Sandbox smoke test: token, card payment through Orders v2, read the order back, refund.
// Uses PayPal's published sandbox test card. Run: node spike/paypal-smoke.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../server/app.mjs';
import { createPayPal } from '../server/paypal/client.mjs';

loadEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'));
const pp = createPayPal(process.env);
console.log('mode:', pp.mode);
const t0 = Date.now();
const r = await pp.payWithCard({
  amount: 54, card: { name: 'Alex Morgan', number: '4111 1111 1111 1111', exp: '12/30', csc: '123' },
  invoiceId: `AP-SMOKE-${Date.now()}`, description: '1 x Trail Backpack',
}).catch((e) => ({ ok: false, error: e.message, detail: e.paypal }));
console.log('pay:', JSON.stringify({ ok: r.ok, id: r.id, status: r.status, captureId: r.captureId, errors: r.errors, error: r.error, detail: r.detail?.details }, null, 0), `${Date.now() - t0} ms`);
if (r.ok) {
  const o = await pp.getOrder(r.id);
  const cap = o.purchase_units?.[0]?.payments?.captures?.[0];
  console.log('read back:', o.status, 'capture', cap?.status, cap?.amount?.value, cap?.amount?.currency_code, 'fee', cap?.seller_receivable_breakdown?.paypal_fee?.value);
  const ref = await pp.refund(r.captureId).catch((e) => ({ error: e.message }));
  console.log('refund:', ref.status || ref.error);
}
