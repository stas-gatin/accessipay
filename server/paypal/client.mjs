// PayPal Orders v2 client. With PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET set it talks to the
// PayPal sandbox; without them it runs in mock mode, and everything it returns says so.
//
// The sandbox blocks an IP for 5 minutes after about 50 requests a minute, so all calls go
// through a small token bucket.

import crypto from 'node:crypto';

const SANDBOX = 'https://api-m.sandbox.paypal.com';

export function paypalMode(env = process.env) {
  return env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET ? 'sandbox' : 'mock';
}

function bucket(perMinute) {
  let tokens = perMinute;
  let last = Date.now();
  return async function take() {
    for (;;) {
      const now = Date.now();
      tokens = Math.min(perMinute, tokens + ((now - last) / 60000) * perMinute);
      last = now;
      if (tokens >= 1) { tokens -= 1; return; }
      await new Promise((r) => setTimeout(r, 500));
    }
  };
}

export function luhnOk(number) {
  const digits = String(number).replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

// "MM/YY", "MM / YY", "MM/YYYY" -> "YYYY-MM", or null
export function parseExpiry(exp) {
  const m = String(exp).trim().match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function validateCard(card, now = new Date()) {
  const errors = [];
  if (!String(card.name || '').trim()) errors.push('Enter the name on the card.');
  if (!luhnOk(card.number)) errors.push('Enter a valid card number.');
  const expiry = parseExpiry(card.exp || '');
  if (!expiry) errors.push('Enter the expiry date as MM/YY.');
  else {
    const [y, m] = expiry.split('-').map(Number);
    if (y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m < now.getUTCMonth() + 1)) errors.push('This card has expired.');
  }
  if (!/^\d{3,4}$/.test(String(card.csc || '').trim())) errors.push('Enter the 3 or 4 digit security code.');
  return { errors, expiry };
}

export function createPayPal(env = process.env) {
  const mode = paypalMode(env);
  const take = bucket(30);
  const mockOrders = new Map();
  let token = null;
  let tokenExp = 0;

  async function accessToken() {
    if (token && Date.now() < tokenExp - 60000) return token;
    await take();
    const r = await fetch(`${SANDBOX}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`PayPal auth failed: ${r.status} ${j.error_description || j.error || ''}`);
    token = j.access_token;
    tokenExp = Date.now() + j.expires_in * 1000;
    return token;
  }

  async function call(method, path, body, requestId) {
    await take();
    const headers = { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' };
    if (requestId) headers['PayPal-Request-Id'] = requestId;
    const r = await fetch(SANDBOX + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    const j = text ? JSON.parse(text) : {};
    if (!r.ok) {
      const detail = j.details?.map((d) => d.issue).join(', ') || j.message || text;
      const err = new Error(`PayPal ${method} ${path} failed: ${r.status} ${detail}`);
      err.paypal = j;
      throw err;
    }
    return j;
  }

  return {
    mode,
    clientId: mode === 'sandbox' ? env.PAYPAL_CLIENT_ID : null,

    // JS SDK flow (PayPal buttons and Card Fields): the browser sends card data to PayPal, never to the shop.
    async createOrder({ amount, currency = 'USD', invoiceId, description }) {
      const value = Number(amount).toFixed(2);
      const o = await call('POST', '/v2/checkout/orders', {
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: currency, value }, invoice_id: invoiceId, description }],
      }, `create-${invoiceId}`);
      return { id: o.id, status: o.status };
    },

    async captureOrder(id) {
      const r = await call('POST', `/v2/checkout/orders/${id}/capture`, {}, `capture-${id}`);
      const capture = r.purchase_units?.[0]?.payments?.captures?.[0];
      if (r.status !== 'COMPLETED' || capture?.status === 'DECLINED') return { ok: false, id: r.id, status: r.status, errors: ['The payment was not completed.'] };
      return { ok: true, id: r.id, status: r.status, captureId: capture?.id, raw: r };
    },

    // Charge a card for one shop order. Returns { id, status, raw }.
    async payWithCard({ amount, currency = 'USD', card, invoiceId, description }) {
      const { errors, expiry } = validateCard(card);
      if (errors.length) return { ok: false, errors };
      const value = Number(amount).toFixed(2);

      if (mode === 'mock') {
        const digits = String(card.number).replace(/\D/g, '');
        if (digits === '4000000000000002') return { ok: false, errors: ['The card was declined.'] };
        const id = 'MOCK-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        const order = { id, status: 'COMPLETED', amount: value, currency, invoice_id: invoiceId, mock: true };
        mockOrders.set(id, order);
        return { ok: true, id, status: 'COMPLETED', raw: order };
      }

      const order = await call('POST', '/v2/checkout/orders', {
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: currency, value }, invoice_id: invoiceId, description }],
        payment_source: {
          card: {
            name: String(card.name).trim(),
            number: String(card.number).replace(/\D/g, ''),
            expiry,
            security_code: String(card.csc).trim(),
          },
        },
      }, `create-${invoiceId}`);

      let result = order;
      if (order.status !== 'COMPLETED') {
        result = await call('POST', `/v2/checkout/orders/${order.id}/capture`, {}, `capture-${invoiceId}`);
      }
      const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
      if (result.status !== 'COMPLETED' || capture?.status === 'DECLINED') {
        return { ok: false, errors: ['The payment was not completed.'], id: result.id, status: result.status, raw: result };
      }
      return { ok: true, id: result.id, status: result.status, captureId: capture?.id, raw: result };
    },

    // Read an order back from PayPal: this is what the run oracle trusts.
    async getOrder(id) {
      if (mode === 'mock') return mockOrders.get(id) || null;
      return call('GET', `/v2/checkout/orders/${id}`);
    },

    async refund(captureId, amount, currency = 'USD') {
      if (mode === 'mock') return { status: 'COMPLETED', mock: true };
      return call('POST', `/v2/payments/captures/${captureId}/refund`, amount ? { amount: { value: Number(amount).toFixed(2), currency_code: currency } } : {});
    },
  };
}
