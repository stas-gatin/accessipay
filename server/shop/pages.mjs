// Server-rendered pages of the demo shop. Every page is plain HTML with its script inline, so the
// fixer can patch exactly what the browser receives. Defects are switched on with `has(id)`.

export const PRODUCTS = [
  { sku: 'bp-01', name: 'Trail Backpack', price: 49, blurb: '28 litres, padded laptop sleeve, rain cover included.' },
  { sku: 'wb-02', name: 'Steel Water Bottle', price: 18, blurb: 'Keeps drinks cold for 24 hours. 750 ml.' },
  { sku: 'rj-03', name: 'Rain Jacket', price: 79, blurb: 'Lightweight, packable, fully taped seams.' },
];

export const SHIPPING = {
  standard: { label: 'Standard delivery, 3 to 5 days', price: 5 },
  express: { label: 'Express delivery, 1 to 2 days', price: 15 },
};

export const COUNTRIES = [
  ['US', 'United States'],
  ['CA', 'Canada'],
  ['GB', 'United Kingdom'],
  ['ES', 'Spain'],
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const money = (n) => '$' + Number(n).toFixed(2);

const ICON_CART = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 8H6.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="20" r="1.6" fill="currentColor"/><circle cx="17" cy="20" r="1.6" fill="currentColor"/></svg>';
const ICON_ARROW = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';

const CSS = `
:root { --ink:#16202a; --muted:#4a5663; --line:#c9d1d9; --brand:#0b4f6c; --brand-ink:#ffffff; --bg:#f7f8fa; --err:#a1131a; --ok:#11643a; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin:0; font:16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:var(--ink); background:var(--bg); }
.top { display:flex; justify-content:space-between; align-items:center; padding:14px 24px; background:#ffffff; border-bottom:1px solid var(--line); }
.brand { font-weight:700; color:var(--brand); text-decoration:none; font-size:18px; }
.top nav a { color:var(--brand); font-weight:600; }
main { max-width:880px; margin:24px auto; padding:0 16px; }
h1 { font-size:26px; margin:0 0 16px; }
h2 { font-size:19px; margin:0 0 8px; }
.grid { list-style:none; padding:0; margin:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; }
.card, .panel { background:#ffffff; border:1px solid var(--line); border-radius:10px; padding:16px; }
.price { font-weight:700; margin:4px 0; }
.btn, button { font:inherit; padding:9px 14px; border-radius:8px; border:1px solid var(--brand); background:#ffffff; color:var(--brand); cursor:pointer; text-decoration:none; display:inline-flex; gap:6px; align-items:center; }
.btn.primary, button.primary { background:var(--brand); color:var(--brand-ink); }
.icon { padding:8px; }
label, .lbl { display:block; font-weight:600; margin:10px 0 4px; }
input, select { font:inherit; padding:8px 10px; border:1px solid #6b7785; border-radius:6px; width:100%; max-width:420px; background:#ffffff; color:var(--ink); }
input[type=checkbox], input[type=radio] { width:auto; }
fieldset { border:1px solid var(--line); border-radius:10px; margin:0 0 16px; padding:12px 16px; background:#ffffff; }
legend { font-weight:700; padding:0 6px; }
.row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.choice { display:flex; gap:8px; align-items:center; font-weight:400; margin:6px 0; }
.status { min-height:1.5em; color:var(--ok); font-weight:600; }
.errors { border:2px solid var(--err); border-radius:8px; padding:10px 14px; color:var(--err); background:#fff5f5; margin-bottom:16px; }
.errors:empty { display:none; }
.invalid { border-color:var(--err); outline:2px solid var(--err); }
.lines { list-style:none; padding:0; margin:0 0 12px; }
.lines li { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:10px 0; border-bottom:1px solid var(--line); flex-wrap:wrap; }
.qty { width:80px; }
.totals p { display:flex; justify-content:space-between; max-width:320px; margin:4px 0; }
.mode { font-size:14px; color:var(--muted); }
.skip { position:absolute; left:-9999px; top:8px; background:#ffffff; color:var(--brand); padding:8px 12px; border:2px solid var(--brand); border-radius:6px; z-index:10; }
.skip:focus { left:8px; }
main:focus { outline:none; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.backdrop { position:fixed; inset:0; background:rgba(10,20,30,.55); display:flex; align-items:center; justify-content:center; }
.modal { background:#ffffff; border-radius:12px; padding:20px 22px; width:min(420px,92vw); position:relative; }
.modal .x { position:absolute; right:12px; top:8px; font-size:24px; cursor:pointer; border:0; background:none; color:var(--ink); padding:4px 8px; }
.dd { position:relative; max-width:420px; }
.dd-current { border:1px solid #6b7785; border-radius:6px; padding:8px 10px; background:#ffffff; cursor:pointer; }
.dd-list { list-style:none; margin:2px 0 0; padding:4px 0; border:1px solid #6b7785; border-radius:6px; background:#ffffff; position:absolute; width:100%; z-index:2; }
.dd-list li { padding:6px 10px; cursor:pointer; }
.dd-list li:hover { background:#e8eef3; }
.fake-check { width:20px; height:20px; border:2px solid #6b7785; border-radius:4px; display:inline-block; cursor:pointer; background:#ffffff; }
.fake-check.on { background:var(--brand); border-color:var(--brand); }
.foot { text-align:center; color:var(--muted); font-size:14px; padding:24px; }
`;

function layout({ title, base, cartCount, body, script = '', mode }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - Pine and Peak Outfitters</title>
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#main">Skip to main content</a>
<header class="top">
  <a class="brand" href="${base}/">Pine and Peak Outfitters</a>
  <nav aria-label="Main"><a href="${base}/cart">Cart (<span id="cart-count">${cartCount}</span>)</a></nav>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="foot"><p>Demo store built for AccessiPay. ${mode === 'sandbox' ? 'Payments run in the PayPal sandbox.' : 'Payment mode: mock, no PayPal call is made.'}</p></footer>
<script>
const BASE = ${JSON.stringify(base)};
async function post(path, data) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data || {}) });
  return r.json();
}
${script}
</script>
</body>
</html>`;
}

export function catalogPage(ctx) {
  const { base, has, cartCount, mode } = ctx;
  const cards = PRODUCTS.map((p) => {
    const button = has('meaningless-button-names')
      ? `<button type="button" class="add icon" data-sku="${p.sku}" aria-label="button">${ICON_CART}</button>`
      : `<button type="button" class="add" data-sku="${p.sku}">${ICON_CART} Add <span class="sr-only">${esc(p.name)} </span>to cart</button>`;
    return `<li class="card">
    <h2>${esc(p.name)}</h2>
    <p class="price">${money(p.price)}</p>
    <p>${esc(p.blurb)}</p>
    ${button}
  </li>`;
  }).join('\n  ');
  const event = has('mousedown-add-to-cart') ? 'mousedown' : 'click';
  return layout({
    title: 'Shop', base, cartCount, mode,
    body: `<h1>Gear for the trail</h1>
<ul class="grid">
  ${cards}
</ul>
<p id="status" class="status" role="status"></p>`,
    script: `
document.querySelectorAll('.add').forEach(function (b) {
  b.addEventListener('${event}', async function () {
    const j = await post('/api/cart/add', { sku: b.dataset.sku });
    document.getElementById('cart-count').textContent = j.count;
    document.getElementById('status').textContent = j.name + ' added to cart. ' + j.count + ' item(s) in your cart.';
  });
});`,
  });
}

export function cartPage(ctx) {
  const { base, has, cart, totals, cartCount, mode } = ctx;
  const lines = cart.length
    ? cart.map((l) => `<li><span>${esc(l.name)}, ${money(l.price)} each</span>
      <span class="row"><label class="choice" for="qty-${l.sku}">Quantity</label><input class="qty" id="qty-${l.sku}" type="number" min="1" max="9" value="${l.qty}" data-sku="${l.sku}">
      <button type="button" class="remove" data-sku="${l.sku}">Remove <span class="sr-only">${esc(l.name)}</span></button></span></li>`).join('\n')
    : '<li>Your cart is empty.</li>';
  const checkout = has('unnamed-checkout-link')
    ? `<a class="btn primary icon" href="${base}/checkout">${ICON_ARROW}</a>`
    : `<a class="btn primary" href="${base}/checkout">Checkout ${ICON_ARROW}</a>`;

  const modal = has('focus-trap-modal')
    ? `<div class="backdrop" id="promo" hidden>
  <div class="modal">
    <span class="x" id="promo-close">&times;</span>
    <h2>Get 10% off your first order</h2>
    <p>Join our newsletter and we will email you a code.</p>
    <label for="promo-email">Email</label>
    <input id="promo-email" type="email">
    <p class="row"><button type="button" id="promo-sub">Subscribe</button></p>
    <p id="promo-msg" class="status"></p>
  </div>
</div>`
    : `<div class="backdrop" id="promo" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="promo-title">
    <button type="button" class="x" id="promo-close" aria-label="Close">&times;</button>
    <h2 id="promo-title">Get 10% off your first order</h2>
    <p>Join our newsletter and we will email you a code.</p>
    <label for="promo-email">Email</label>
    <input id="promo-email" type="email">
    <p class="row"><button type="button" id="promo-sub">Subscribe</button></p>
    <p id="promo-msg" class="status" role="status"></p>
  </div>
</div>`;

  const modalScript = has('focus-trap-modal')
    ? `
function trap(e) {
  if (e.key === 'Escape') { e.preventDefault(); return; }
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const items = [document.getElementById('promo-email'), document.getElementById('promo-sub')];
  const i = items.indexOf(document.activeElement);
  items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
}
function closePromo() { promo.hidden = true; document.removeEventListener('keydown', trap, true); sessionStorage.setItem(KEY, '1'); }
function openPromo() { promo.hidden = false; document.addEventListener('keydown', trap, true); document.getElementById('promo-email').focus(); }
document.getElementById('promo-close').addEventListener('click', closePromo);`
    : `
let before = null;
function keys(e) {
  if (e.key === 'Escape') { e.preventDefault(); closePromo(); return; }
  if (e.key !== 'Tab') return;
  const items = Array.from(promo.querySelectorAll('button, input'));
  const i = items.indexOf(document.activeElement);
  e.preventDefault();
  items[(i + (e.shiftKey ? items.length - 1 : 1) + items.length) % items.length].focus();
}
function closePromo() { promo.hidden = true; document.removeEventListener('keydown', keys, true); sessionStorage.setItem(KEY, '1'); (before && before !== document.body ? before : document.querySelector('h1')).focus(); }
function openPromo() { before = document.activeElement; promo.hidden = false; document.addEventListener('keydown', keys, true); document.getElementById('promo-close').focus(); }
document.getElementById('promo-close').addEventListener('click', closePromo);`;

  const restoreFocus = !has('focus-lost-on-update');
  return layout({
    title: 'Your cart', base, cartCount, mode,
    body: `<h1 tabindex="-1">Your cart</h1>
<div class="panel">
  <ul class="lines" id="lines">
${lines}
  </ul>
  <form class="row" id="coupon-form">
    <label for="coupon" class="choice">Promo code</label>
    <input id="coupon" name="coupon" style="max-width:200px" value="${esc(ctx.coupon || '')}">
    <button type="submit">Apply code</button>
  </form>
  <p id="coupon-msg" class="status" role="status"></p>
  <div class="totals" id="totals">
    <p><span>Subtotal</span><span>${money(totals.subtotal)}</span></p>
    <p><span>Discount</span><span>${money(totals.discount)}</span></p>
    <p><strong>Total before delivery</strong><strong>${money(totals.subtotal - totals.discount)}</strong></p>
  </div>
  <p class="row">${cart.length ? checkout : ''} <a href="${base}/">Continue shopping</a></p>
</div>
${modal}`,
    script: `
const KEY = 'promo-' + BASE;
const promo = document.getElementById('promo');
${modalScript}
document.getElementById('promo-sub').addEventListener('click', function () {
  document.getElementById('promo-msg').textContent = 'Thanks for subscribing!';
});
if (!sessionStorage.getItem(KEY) && document.querySelectorAll('.qty').length) setTimeout(openPromo, 300);

document.getElementById('coupon-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const j = await post('/api/coupon', { code: document.getElementById('coupon').value });
  document.getElementById('coupon-msg').textContent = j.message;
  if (j.ok) setTimeout(function () { location.reload(); }, 600);
});
document.getElementById('lines').addEventListener('change', async function (e) {
  if (!e.target.classList.contains('qty')) return;
  const sku = e.target.dataset.sku;
  await post('/api/cart/qty', { sku: sku, qty: Number(e.target.value) });
  const html = await (await fetch(location.href)).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.getElementById('lines').innerHTML = doc.getElementById('lines').innerHTML;
  document.getElementById('totals').innerHTML = doc.getElementById('totals').innerHTML;
  document.getElementById('cart-count').textContent = doc.getElementById('cart-count').textContent;
  ${restoreFocus ? "document.getElementById('qty-' + sku).focus();" : "document.activeElement.blur();"}
});
document.getElementById('lines').addEventListener('click', async function (e) {
  const b = e.target.closest('.remove');
  if (!b) return;
  await post('/api/cart/qty', { sku: b.dataset.sku, qty: 0 });
  location.reload();
});`,
  });
}

export function checkoutPage(ctx) {
  const { base, has, cartCount, mode, shipping } = ctx;
  const v = (k) => esc(shipping?.[k] || '');

  const nameEmail = has('swapped-labels')
    ? `<label for="email">Full name</label><input id="name" name="name" autocomplete="name" required value="${v('name')}">
    <label for="name">Email</label><input id="email" name="email" type="email" autocomplete="email" required value="${v('email')}">`
    : `<label for="name">Full name</label><input id="name" name="name" autocomplete="name" required value="${v('name')}">
    <label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required value="${v('email')}">`;

  const city = has('unlabeled-city-field')
    ? `<div class="lbl">City</div><input id="city" name="city" value="${v('city')}">`
    : `<label for="city">City</label><input id="city" name="city" autocomplete="address-level2" required value="${v('city')}">`;

  const country = has('custom-country-dropdown')
    ? `<div class="lbl">Country</div>
    <div class="dd" id="country-dd">
      <div class="dd-current" id="country-current">Choose a country</div>
      <ul class="dd-list" id="country-list" hidden>
        ${COUNTRIES.map(([c, n]) => `<li data-v="${c}">${n}</li>`).join('')}
      </ul>
    </div>
    <input type="hidden" id="country" name="country" value="${v('country')}">`
    : `<label for="country">Country</label>
    <select id="country" name="country" autocomplete="country" required>
      <option value="">Choose a country</option>
      ${COUNTRIES.map(([c, n]) => `<option value="${c}"${shipping?.country === c ? ' selected' : ''}>${n}</option>`).join('')}
    </select>`;

  const terms = has('fake-terms-checkbox')
    ? `<p class="row"><input type="checkbox" id="terms" name="terms" style="display:none"><span class="fake-check" id="fake-terms"></span> <span>I agree to the terms of sale</span></p>`
    : `<p class="row"><input type="checkbox" id="terms" name="terms" required> <label for="terms" class="choice">I agree to the terms of sale</label></p>`;

  const silent = has('silent-validation');
  return layout({
    title: 'Checkout', base, cartCount, mode,
    body: `<h1>Checkout</h1>
<div id="errors" class="errors" tabindex="-1" ${silent ? 'aria-hidden="true"' : 'role="alert"'}></div>
<form id="checkout" novalidate>
  <fieldset>
    <legend>Contact</legend>
    ${nameEmail}
  </fieldset>
  <fieldset>
    <legend>Shipping address</legend>
    <label for="street">Street address</label><input id="street" name="street" autocomplete="street-address" required value="${v('street')}">
    ${city}
    <label for="zip">ZIP or postal code</label><input id="zip" name="zip" autocomplete="postal-code" required value="${v('zip')}">
    ${country}
  </fieldset>
  <fieldset>
    <legend>Delivery</legend>
    ${Object.entries(SHIPPING).map(([k, s]) => `<label class="choice"><input type="radio" name="delivery" value="${k}"${shipping?.delivery === k ? ' checked' : ''}> ${s.label}, ${money(s.price)}</label>`).join('\n    ')}
  </fieldset>
  ${terms}
  <p><button type="submit" class="primary">Continue to payment</button></p>
</form>`,
    script: `
const SILENT = ${silent};
${has('custom-country-dropdown') ? `
document.getElementById('country-current').addEventListener('click', function () {
  const l = document.getElementById('country-list'); l.hidden = !l.hidden;
});
document.getElementById('country-list').addEventListener('click', function (e) {
  const li = e.target.closest('li'); if (!li) return;
  document.getElementById('country').value = li.dataset.v;
  document.getElementById('country-current').textContent = li.textContent;
  document.getElementById('country-list').hidden = true;
});` : ''}
${has('fake-terms-checkbox') ? `
document.getElementById('fake-terms').addEventListener('click', function () {
  const t = document.getElementById('terms'); t.checked = !t.checked; this.classList.toggle('on', t.checked);
});` : ''}
document.getElementById('checkout').addEventListener('submit', async function (e) {
  e.preventDefault();
  const f = e.target;
  const val = function (id) { return document.getElementById(id).value; };
  const data = {
    name: val('name'), email: val('email'), street: val('street'), city: val('city'),
    zip: val('zip'), country: val('country'),
    delivery: (f.querySelector('input[name=delivery]:checked') || {}).value || '',
    terms: document.getElementById('terms').checked,
  };
  const j = await post('/api/checkout', data);
  const box = document.getElementById('errors');
  f.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
  f.querySelectorAll('.invalid').forEach(function (el) { el.classList.remove('invalid'); });
  if (j.ok) { location.href = BASE + '/pay'; return; }
  box.innerHTML = '<h2>Please fix ' + j.errors.length + ' problem' + (j.errors.length > 1 ? 's' : '') + '</h2><ul>' +
    j.errors.map(function (er) { return '<li>' + er.message + '</li>'; }).join('') + '</ul>';
  j.errors.forEach(function (er) {
    const el = document.getElementById(er.field) || f.querySelector('[name=' + er.field + ']');
    if (!el) return;
    el.classList.add('invalid');
    if (!SILENT) el.setAttribute('aria-invalid', 'true');
  });
  if (!SILENT) box.focus();
});`,
  });
}

export function payPage(ctx) {
  const { base, has, cartCount, mode, totals, shipping } = ctx;
  const ph = has('placeholder-only-card-fields');
  const field = (id, label, extra, placeholder) => ph
    ? `<p><input id="${id}" name="${id}" placeholder="${placeholder}" ${extra}></p>`
    : `<label for="${id}">${label}</label><input id="${id}" name="${id}" ${extra}>`;
  const payLabel = `Pay ${money(totals.total)}`;
  const payButton = has('div-pay-button')
    ? `<div class="btn primary" id="pay-button">${payLabel}</div>`
    : `<button type="submit" class="primary" id="pay-button">${payLabel}</button>`;
  return layout({
    title: 'Payment', base, cartCount, mode,
    body: `<h1>Payment</h1>
<div class="panel totals">
  <h2>Order summary</h2>
  <p><span>Items</span><span>${money(totals.subtotal - totals.discount)}</span></p>
  <p><span>Delivery</span><span>${money(totals.delivery)}</span></p>
  <p><strong>Total</strong><strong>${money(totals.total)}</strong></p>
  <p class="mode">Shipping to ${esc(shipping?.name || '')}, ${esc(shipping?.city || '')}</p>
</div>
<form id="pay" class="panel" novalidate>
  <h2>Pay by card with PayPal</h2>
  <p class="mode">${mode === 'sandbox' ? 'Processed in the PayPal sandbox. Use a test card.' : 'Mock mode: nothing is sent to PayPal.'}</p>
  ${field('cc-name', 'Name on card', 'autocomplete="cc-name"', 'Name on card')}
  ${field('cc-number', 'Card number', 'inputmode="numeric" autocomplete="cc-number"', 'Card number')}
  ${field('cc-exp', 'Expiry date (MM/YY)', 'autocomplete="cc-exp"', 'MM/YY')}
  ${field('cc-csc', 'Security code', 'inputmode="numeric" autocomplete="cc-csc"', 'CVC')}
  <div id="pay-errors" class="errors" role="alert"></div>
  <p>${payButton}</p>
</form>`,
    script: `
let busy = false;
async function pay(e) {
  if (e) e.preventDefault();
  if (busy) return;
  busy = true;
  const val = function (id) { return document.getElementById(id).value; };
  const j = await post('/api/pay', {
    name: val('cc-name'), number: val('cc-number'), exp: val('cc-exp'), csc: val('cc-csc'),
  });
  busy = false;
  if (j.ok) { location.href = BASE + '/done'; return; }
  document.getElementById('pay-errors').innerHTML = '<ul>' + j.errors.map(function (m) { return '<li>' + m + '</li>'; }).join('') + '</ul>';
}
document.getElementById('pay').addEventListener('submit', pay);
${has('div-pay-button') ? "document.getElementById('pay-button').addEventListener('click', pay);" : ''}`,
  });
}

export function donePage(ctx) {
  const { base, cartCount, mode, order } = ctx;
  const body = order
    ? `<h1>Order confirmed</h1>
<div class="panel">
  <p>Thank you, ${esc(order.name)}. Your order <strong>${esc(order.id)}</strong> is paid.</p>
  <p>Total charged: ${money(order.total)}. PayPal order ${esc(order.paypalOrderId)}, status ${esc(order.status)}.</p>
  <p><a href="${base}/">Back to the shop</a></p>
</div>`
    : `<h1>No order yet</h1><p><a href="${base}/">Back to the shop</a></p>`;
  return layout({ title: order ? 'Order confirmed' : 'No order', base, cartCount, mode, body });
}
