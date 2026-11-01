// Sandbox Outfitters: a small, separate shop that stands in for a merchant's staging site.
// It takes payments with the PayPal JS SDK (buttons and Card Fields) on the merchant's own sandbox app,
// and it has bot protection that turns automated browsers away unless they carry the owner's access key.
// AccessiPay tests it the way it tests any owner's shop: verify the domain, let the browser in,
// connect the PayPal sandbox, send the customers.
//
//   SHOP_PAYPAL_CLIENT_ID=… SHOP_PAYPAL_CLIENT_SECRET=… node examples/sandbox-shop/server.mjs
//
// Env: PORT (4401), SHOP_PAYPAL_CLIENT_ID / SHOP_PAYPAL_CLIENT_SECRET (a PayPal sandbox app; defaults to the
// AccessiPay .env keys so it runs out of the box), ACCESSIPAY_VERIFY (the verification code AccessiPay shows),
// ACCESS_KEY (the access key: when set, browsers without it are turned away like by a bot manager).
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPayPal } from '../../server/paypal/client.mjs';
import { loadEnv } from '../../server/app.mjs';

loadEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'));

export const PRODUCTS = [
  { sku: 'shell', name: 'Rain Shell', price: 79, note: 'Waterproof, packs into its own pocket.' },
  { sku: 'flask', name: 'Steel Flask', price: 24, note: 'Keeps drinks hot for 12 hours.' },
  { sku: 'cap', name: 'Trail Cap', price: 18, note: 'Quick-dry, one size.' },
];
const DELIVERY = { standard: { label: 'Standard delivery, 3 to 5 days', price: 6 }, express: { label: 'Express delivery, next day', price: 15 } };
const money = (n) => `$${Number(n).toFixed(2)}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createSandboxShop({ env = process.env } = {}) {
  const keys = { PAYPAL_CLIENT_ID: env.SHOP_PAYPAL_CLIENT_ID || env.PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET: env.SHOP_PAYPAL_CLIENT_SECRET || env.PAYPAL_CLIENT_SECRET };
  const paypal = createPayPal(keys);
  const sessions = new Map();
  const orders = new Map();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Domain verification for AccessiPay: the owner publishes the code it shows.
  app.get('/.well-known/accessipay.txt', (req, res) => res.type('text').send(env.ACCESSIPAY_VERIFY || ''));

  // Bot protection, the way a bot manager behaves: automated browsers get a block page,
  // unless the request carries the owner's access key (the allow rule the owner adds for AccessiPay).
  app.use((req, res, next) => {
    if (!env.ACCESS_KEY) return next();
    const automated = /HeadlessChrome|Playwright|python-requests|curl\//i.test(req.get('user-agent') || '');
    if (!automated || req.get('x-accessipay-key') === env.ACCESS_KEY) return next();
    res.status(403).type('html').send('<!doctype html><title>Access denied</title><h1>Access denied</h1><p>Automated traffic is not allowed.</p>');
  });

  app.use((req, res, next) => {
    let sid = (req.get('cookie') || '').match(/(?:^|;\s*)sid=([a-f0-9]{16})/)?.[1];
    if (!sid || !sessions.has(sid)) {
      sid = crypto.randomBytes(8).toString('hex');
      sessions.set(sid, { cart: [], shipping: null });
      res.set('set-cookie', `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
    }
    req.s = sessions.get(sid);
    next();
  });

  const count = (s) => s.cart.reduce((n, l) => n + l.qty, 0);
  const totals = (s) => {
    const items = s.cart.reduce((n, l) => n + l.qty * PRODUCTS.find((p) => p.sku === l.sku).price, 0);
    const delivery = s.shipping ? DELIVERY[s.shipping.delivery].price : 0;
    return { items, delivery, total: items + delivery };
  };
  const page = (s, title, body, head = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Sandbox Outfitters</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; color: #1d2a24; background: #f6f4ee; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 14px 28px; background: #23443a; color: #fff; }
  header a { color: #fff; font-weight: 600; text-decoration: none; }
  .staging { background: #f2c14e; color: #2b2200; text-align: center; font-size: 14px; padding: 4px; }
  main { max-width: 860px; margin: 28px auto; padding: 0 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .card { background: #fff; border: 1px solid #ddd6c8; border-radius: 10px; padding: 18px; }
  button, .btn { font: inherit; background: #23443a; color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; cursor: pointer; text-decoration: none; display: inline-block; }
  label { display: block; margin: 10px 0 4px; font-weight: 600; }
  input, select { font: inherit; width: 100%; max-width: 420px; padding: 8px 10px; border: 1px solid #b9b2a3; border-radius: 6px; box-sizing: border-box; }
  fieldset { border: 1px solid #ddd6c8; border-radius: 8px; margin: 14px 0; max-width: 420px; }
  fieldset label { font-weight: 400; display: flex; gap: 8px; align-items: center; } fieldset input { width: auto; }
  .row { display: flex; justify-content: space-between; max-width: 420px; }
  .pp-field { max-width: 420px; min-height: 52px; } .errors { color: #a1261b; }
  :focus-visible { outline: 3px solid #d17a00; outline-offset: 2px; }
</style>${head}</head><body>
<p class="staging">Staging copy: payments run in the PayPal sandbox, no real money moves.</p>
<header><a href="/">Sandbox Outfitters</a><a href="/cart">Cart (${count(s)})</a></header>
<main>${body}</main></body></html>`;

  app.get('/', (req, res) => res.send(page(req.s, 'Shop', `<h1>Gear for wet trails</h1><div class="grid">${PRODUCTS.map((p) => `
<form class="card" method="post" action="/cart"><h2>${esc(p.name)}</h2><p>${esc(p.note)}</p><p><strong>${money(p.price)}</strong></p>
<input type="hidden" name="sku" value="${p.sku}"><button type="submit">Add ${esc(p.name)} to cart</button></form>`).join('')}</div>`)));

  app.post('/cart', (req, res) => {
    const p = PRODUCTS.find((x) => x.sku === req.body.sku);
    if (p) { const l = req.s.cart.find((x) => x.sku === p.sku); if (l) l.qty += 1; else req.s.cart.push({ sku: p.sku, qty: 1 }); }
    res.redirect(303, '/cart');
  });
  app.get('/cart', (req, res) => {
    const t = totals(req.s);
    res.send(page(req.s, 'Cart', req.s.cart.length ? `<h1>Your cart</h1><div class="card">${req.s.cart.map((l) => { const p = PRODUCTS.find((x) => x.sku === l.sku); return `<p class="row"><span>${l.qty} × ${esc(p.name)}</span><span>${money(l.qty * p.price)}</span></p>`; }).join('')}
<p class="row"><strong>Items</strong><strong>${money(t.items)}</strong></p><p><a class="btn" href="/checkout">Checkout</a></p></div>` : '<h1>Your cart is empty</h1><p><a href="/">Back to the shop</a></p>'));
  });

  app.get('/checkout', (req, res) => {
    if (!req.s.cart.length) return res.redirect('/cart');
    const f = (id, label, type = 'text', auto = '') => `<label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" ${auto ? `autocomplete="${auto}"` : ''} required>`;
    res.send(page(req.s, 'Checkout', `<h1>Checkout</h1><form class="card" method="post" action="/checkout">
<h2>Contact and delivery address</h2>
${f('name', 'Full name', 'text', 'name')}${f('email', 'Email', 'email', 'email')}${f('phone', 'Phone', 'tel', 'tel')}
${f('street', 'Street address', 'text', 'street-address')}${f('city', 'City', 'text', 'address-level2')}${f('state', 'State', 'text', 'address-level1')}${f('zip', 'ZIP code', 'text', 'postal-code')}
<label for="country">Country</label><select id="country" name="country" autocomplete="country-name"><option>United States</option><option>Canada</option><option>United Kingdom</option></select>
<fieldset><legend>Delivery</legend>${Object.entries(DELIVERY).map(([k, d], i) => `<label><input type="radio" name="delivery" value="${k}" ${i === 0 ? 'checked' : ''}> ${d.label}, ${money(d.price)}</label>`).join('')}</fieldset>
<button type="submit">Continue to payment</button></form>`));
  });
  app.post('/checkout', (req, res) => {
    const b = req.body;
    if (!b.name || !b.email || !b.street || !b.city || !b.zip) return res.redirect(303, '/checkout');
    req.s.shipping = { name: b.name, email: b.email, city: b.city, delivery: DELIVERY[b.delivery] ? b.delivery : 'standard' };
    res.redirect(303, '/pay');
  });

  app.get('/pay', (req, res) => {
    if (!req.s.cart.length || !req.s.shipping) return res.redirect('/checkout');
    const t = totals(req.s);
    res.send(page(req.s, 'Payment', `<h1>Payment</h1>
<div class="card"><p class="row"><span>Items</span><span>${money(t.items)}</span></p><p class="row"><span>Delivery</span><span>${money(t.delivery)}</span></p>
<p class="row"><strong>Total</strong><strong>${money(t.total)}</strong></p></div>
<form id="pay" class="card" novalidate><h2>Pay with PayPal</h2><div id="paypal-buttons" style="max-width:420px"></div>
<h2>Or pay by card</h2><p>Card details go to PayPal; this shop never sees them.</p>
<div id="card-name" class="pp-field"></div><div id="card-number" class="pp-field"></div><div id="card-expiry" class="pp-field"></div><div id="card-cvv" class="pp-field"></div>
<div id="pay-errors" class="errors" role="alert"></div><p><button type="submit">Pay ${money(t.total)}</button></p></form>
<script>
function showErrors(list) { document.getElementById('pay-errors').innerHTML = '<ul>' + list.map(function (m) { return '<li>' + m + '</li>'; }).join('') + '</ul>'; }
function createOrder() { return fetch('/api/orders', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (j) { if (!j.id) throw new Error(j.error || 'order'); return j.id; }); }
function onApprove(data) {
  return fetch('/api/orders/' + data.orderID + '/capture', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (j) {
    if (j.ok) { location.href = '/done/' + j.orderId; return; }
    showErrors(['The payment did not go through.']);
  });
}
function onError() { showErrors(['The payment did not go through. Check the card details and try again.']); }
paypal.Buttons({ createOrder: createOrder, onApprove: onApprove, onError: onError, style: { layout: 'horizontal', tagline: false, height: 44 } }).render('#paypal-buttons');
var cardFields = paypal.CardFields({ createOrder: createOrder, onApprove: onApprove, onError: onError });
if (cardFields.isEligible()) { cardFields.NameField().render('#card-name'); cardFields.NumberField().render('#card-number'); cardFields.ExpiryField().render('#card-expiry'); cardFields.CVVField().render('#card-cvv'); }
var busy = false;
document.getElementById('pay').addEventListener('submit', function (e) {
  e.preventDefault(); if (busy) return; busy = true;
  cardFields.submit().catch(function (err) { showErrors(['Check the card details: ' + (err && err.message ? err.message : 'the card was not accepted') + '.']); }).then(function () { busy = false; });
});
</script>`, `<script src="https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(keys.PAYPAL_CLIENT_ID || '')}&components=buttons,card-fields&currency=USD&intent=capture"></script>`));
  });

  // The shop's own server creates and captures the order with its own sandbox keys, as a real integration does.
  app.post('/api/orders', async (req, res) => {
    try {
      if (!req.s.cart.length || !req.s.shipping) return res.status(400).json({ error: 'The cart is empty' });
      const t = totals(req.s);
      const o = await paypal.createOrder({ amount: t.total, invoiceId: `SO-${crypto.randomBytes(5).toString('hex')}`, description: 'Sandbox Outfitters order' });
      orders.set(o.id, { sid: req.s, total: t.total, lines: req.s.cart.map((l) => ({ ...l })), delivery: req.s.shipping.delivery });
      res.json({ id: o.id });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  app.post('/api/orders/:id/capture', async (req, res) => {
    const o = orders.get(req.params.id);
    if (!o) return res.status(404).json({ ok: false });
    try {
      const r = await paypal.captureOrder(req.params.id);
      if (r.ok) { o.status = 'COMPLETED'; o.captureId = r.captureId; req.s.cart = []; req.s.shipping = null; }
      res.json({ ok: r.ok, orderId: req.params.id });
    } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
  });
  app.get('/done/:id', (req, res) => {
    const o = orders.get(req.params.id);
    res.send(page(req.s, o?.status === 'COMPLETED' ? 'Order confirmed' : 'No order', o?.status === 'COMPLETED'
      ? `<h1>Order confirmed</h1><div class="card"><p>Thank you. Your order is paid: ${money(o.total)}.</p><p>PayPal order ${esc(req.params.id)}.</p><p><a href="/">Back to the shop</a></p></div>`
      : '<h1>No order yet</h1><p><a href="/">Back to the shop</a></p>'));
  });

  return { app, paypal, orders };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4401);
  const { app, paypal } = createSandboxShop();
  app.listen(port, () => console.log(`Sandbox Outfitters on http://localhost:${port} (PayPal: ${paypal.mode})`));
}
