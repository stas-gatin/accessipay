// Shop instances: each run gets its own shop with its own cart, defects and fixer patches.
// A patch is { page, find, replace }: an exact text replacement on the HTML the browser gets.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { DEFECT_IDS } from './defects.mjs';
import { PRODUCTS, SHIPPING, COUNTRIES, catalogPage, cartPage, checkoutPage, payPage, donePage } from './pages.mjs';

const PAGES = { catalog: catalogPage, cart: cartPage, checkout: checkoutPage, pay: payPage, done: donePage };
export const PAGE_PATHS = { catalog: '/', cart: '/cart', checkout: '/checkout', pay: '/pay', done: '/done' };
const TTL_MS = 60 * 24 * 60 * 60 * 1000;

export function createShop({ paypal, dataDir }) {
  const instances = new Map();
  const dir = dataDir ? path.join(dataDir, 'instances') : null;
  if (dir) fs.mkdirSync(dir, { recursive: true });

  // Instances (defects, fixer patches, current cart) survive a server restart.
  function save(inst) {
    if (dir) fs.writeFileSync(path.join(dir, `${inst.id}.json`), JSON.stringify(inst));
  }

  function create({ defects = [], patches = [] } = {}) {
    const unknown = defects.filter((d) => !DEFECT_IDS.has(d));
    if (unknown.length) throw new Error(`Unknown defects: ${unknown.join(', ')}`);
    const id = crypto.randomBytes(5).toString('hex');
    const inst = { id, defects: [...defects], patches: [...patches], cart: [], coupon: '', shipping: null, order: null, created: Date.now() };
    instances.set(id, inst);
    save(inst);
    return inst;
  }

  function get(id) {
    if (!instances.has(id) && dir && /^[a-f0-9]+$/.test(id)) {
      const file = path.join(dir, `${id}.json`);
      if (fs.existsSync(file)) instances.set(id, JSON.parse(fs.readFileSync(file, 'utf8')));
    }
    const inst = instances.get(id);
    if (inst && Date.now() - inst.created > TTL_MS) { instances.delete(id); return null; }
    return inst || null;
  }

  function totals(inst) {
    const subtotal = inst.cart.reduce((s, l) => s + l.price * l.qty, 0);
    const discount = inst.coupon === 'WELCOME10' ? Math.round(subtotal * 10) / 100 : 0;
    const delivery = inst.shipping?.delivery ? SHIPPING[inst.shipping.delivery].price : 0;
    return { subtotal, discount, delivery, total: Math.round((subtotal - discount + delivery) * 100) / 100 };
  }

  // The exact HTML the browser receives for a page, with the instance's patches applied.
  function render(inst, page, base) {
    const has = (d) => inst.defects.includes(d);
    let html = PAGES[page]({
      base, has, mode: paypal.mode, paypalClientId: paypal.clientId, cart: inst.cart, coupon: inst.coupon, shipping: inst.shipping,
      totals: totals(inst), order: inst.order, cartCount: inst.cart.reduce((s, l) => s + l.qty, 0),
    });
    for (const p of inst.patches.filter((x) => x.page === page)) {
      if (html.split(p.find).length === 2) html = html.replace(p.find, () => p.replace);
    }
    return html;
  }

  // Unpatched page source, used by the fixer as the "before" text.
  function renderUnpatched(inst, page, base) {
    return render({ ...inst, patches: [] }, page, base);
  }

  const router = express.Router({ mergeParams: true });
  router.use(express.json());
  router.use((req, res, next) => {
    req.inst = get(req.params.iid);
    if (!req.inst) return res.status(404).send('This demo shop has expired. Start a new run.');
    req.base = req.baseUrl;
    next();
  });

  for (const [page, path] of Object.entries(PAGE_PATHS)) {
    router.get(path, (req, res) => {
      res.set('cache-control', 'no-store').type('html').send(render(req.inst, page, req.base));
    });
  }

  router.use((req, res, next) => {
    if (req.method === 'POST') res.on('finish', () => save(req.inst));
    next();
  });

  router.post('/api/cart/add', (req, res) => {
    const p = PRODUCTS.find((x) => x.sku === req.body.sku);
    if (!p) return res.status(400).json({ ok: false });
    const line = req.inst.cart.find((l) => l.sku === p.sku);
    if (line) line.qty += 1; else req.inst.cart.push({ sku: p.sku, name: p.name, price: p.price, qty: 1 });
    res.json({ ok: true, name: p.name, count: req.inst.cart.reduce((s, l) => s + l.qty, 0) });
  });

  router.post('/api/cart/qty', (req, res) => {
    const qty = Math.max(0, Math.min(9, Number(req.body.qty) || 0));
    const line = req.inst.cart.find((l) => l.sku === req.body.sku);
    if (line) line.qty = qty;
    req.inst.cart = req.inst.cart.filter((l) => l.qty > 0);
    res.json({ ok: true });
  });

  router.post('/api/coupon', (req, res) => {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (code === 'WELCOME10') { req.inst.coupon = code; return res.json({ ok: true, message: 'Code applied: 10% off.' }); }
    res.json({ ok: false, message: 'That code is not valid.' });
  });

  router.post('/api/checkout', (req, res) => {
    const b = req.body || {};
    const errors = [];
    const need = (field, message) => { if (!String(b[field] ?? '').trim()) errors.push({ field, message }); };
    need('name', 'Enter your full name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.email || '').trim())) errors.push({ field: 'email', message: 'Enter a valid email address.' });
    need('street', 'Enter your street address.');
    need('city', 'Enter your city.');
    need('zip', 'Enter your ZIP or postal code.');
    if (!COUNTRIES.some(([c]) => c === b.country)) errors.push({ field: 'country', message: 'Choose a country.' });
    if (!SHIPPING[b.delivery]) errors.push({ field: 'delivery', message: 'Choose a delivery option.' });
    if (b.terms !== true) errors.push({ field: 'terms', message: 'Agree to the terms of sale.' });
    if (!req.inst.cart.length) errors.push({ field: 'name', message: 'Your cart is empty.' });
    if (errors.length) return res.json({ ok: false, errors });
    req.inst.shipping = { name: b.name.trim(), email: b.email.trim(), street: b.street.trim(), city: b.city.trim(), zip: b.zip.trim(), country: b.country, delivery: b.delivery };
    res.json({ ok: true });
  });

  // JS SDK flow: the browser asks for an order, PayPal collects the card, the server captures.
  router.post('/api/paypal/order', async (req, res) => {
    const inst = req.inst;
    if (!inst.shipping || !inst.cart.length) return res.status(400).json({ error: 'Complete checkout first.' });
    if (paypal.mode !== 'sandbox') return res.status(400).json({ error: 'PayPal is in mock mode.' });
    try {
      const t = totals(inst);
      const o = await paypal.createOrder({ amount: t.total, invoiceId: `AP-${inst.id}-${Date.now()}`, description: inst.cart.map((l) => `${l.qty} x ${l.name}`).join(', ') });
      inst.pendingPaypalOrder = o.id;
      inst.paying = true;
      setTimeout(() => { if (inst.pendingPaypalOrder === o.id && !inst.order) inst.paying = false; }, 60000);
      res.json({ id: o.id });
    } catch (e) {
      inst.paying = false;
      console.error(`[paypal order ${inst.id}] ${e.message}`);
      res.status(502).json({ error: 'PayPal could not create the order.' });
    }
  });

  router.post('/api/paypal/capture', async (req, res) => {
    const inst = req.inst;
    const id = String(req.body?.orderID || '');
    if (!id || id !== inst.pendingPaypalOrder) return res.status(400).json({ ok: false, errors: ['Unknown order.'] });
    try {
      const r = await paypal.captureOrder(id);
      if (!r.ok) return res.json({ ok: false, errors: r.errors });
      const t = totals(inst);
      inst.order = { id: 'PP-' + inst.id.toUpperCase(), name: inst.shipping.name, total: t.total, lines: inst.cart.map((l) => ({ sku: l.sku, qty: l.qty })), delivery: inst.shipping.delivery, paypalOrderId: r.id, captureId: r.captureId, status: r.status, mode: paypal.mode, via: 'paypal-js-sdk' };
      inst.cart = [];
      res.json({ ok: true });
    } catch (e) {
      console.error(`[paypal capture ${inst.id}] ${e.message}`);
      res.json({ ok: false, errors: ['The payment did not go through. Check the card details and try again.'] });
    } finally {
      inst.paying = false;
    }
  });

  router.post('/api/pay', async (req, res) => {
    const inst = req.inst;
    if (!inst.shipping || !inst.cart.length) return res.json({ ok: false, errors: ['Complete checkout first.'] });
    if (inst.order?.status === 'COMPLETED') return res.json({ ok: true });
    const t = totals(inst);
    if (inst.paying) return res.json({ ok: false, errors: ['The payment is already being processed.'] });
    inst.paying = true;
    try {
      const r = await paypal.payWithCard({
        amount: t.total,
        card: req.body || {},
        invoiceId: `AP-${inst.id}-${Date.now()}`,
        description: inst.cart.map((l) => `${l.qty} x ${l.name}`).join(', '),
      });
      if (!r.ok) return res.json({ ok: false, errors: r.errors });
      inst.order = { id: 'PP-' + inst.id.toUpperCase(), name: inst.shipping.name, total: t.total, lines: inst.cart.map((l) => ({ sku: l.sku, qty: l.qty })), delivery: inst.shipping.delivery, paypalOrderId: r.id, captureId: r.captureId, status: r.status, mode: paypal.mode };
      inst.cart = [];
      res.json({ ok: true });
    } catch (e) {
      console.error(`[pay ${inst.id}] ${e.message}`);
      res.json({ ok: false, errors: ['The payment service is not available right now.'] });
    } finally {
      inst.paying = false;
    }
  });

  function forget(id) { instances.delete(id); if (dir) fs.rmSync(path.join(dir, `${id}.json`), { force: true }); }

  return { create, get, save, forget, render, renderUnpatched, totals, router, instances };
}
