// The "scanner" side of the comparison: a standard axe-core scan (all default rules, including
// best practices) of every page of the checkout flow, with a filled cart so every page renders fully.

import AxeBuilder from '@axe-core/playwright';
import { PAGE_PATHS } from '../shop/instances.mjs';

const FLOW = ['catalog', 'cart', 'checkout', 'pay'];

// axe-core also reports nodes inside iframes (a node's target then has one selector per frame).
// Those belong to whoever serves the iframe, such as PayPal's hosted card fields, not to the shop's
// own code, so they are kept apart and never added to the shop's count.
export function splitByFrame(violations) {
  const own = [];
  const embedded = [];
  for (const v of violations) {
    const base = { id: v.id, impact: v.impact, help: v.help, tags: v.tags };
    const mine = v.nodes.filter((n) => n.target.length === 1);
    const theirs = v.nodes.filter((n) => n.target.length > 1);
    if (mine.length) own.push({ ...base, nodes: mine.length, targets: mine.map((n) => n.target.join(' ')).slice(0, 5) });
    if (theirs.length) embedded.push({ ...base, nodes: theirs.length, targets: theirs.map((n) => n.target.join(' >>> ')).slice(0, 5) });
  }
  return { own, embedded };
}

export async function scanShop({ browser, shop, origin, defects = [], patches = [] }) {
  const inst = shop.create({ defects, patches });
  inst.cart = [{ sku: 'bp-01', name: 'Trail Backpack', price: 49, qty: 1 }];
  inst.shipping = { name: 'Alex Morgan', email: 'alex.morgan@example.com', street: '12 Market Street', city: 'Springfield', zip: '62701', country: 'US', delivery: 'standard' };
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  const pages = [];
  try {
    for (const name of FLOW) {
      await page.goto(`${origin}/s/${inst.id}${PAGE_PATHS[name]}`, { waitUntil: 'load' });
      await page.waitForTimeout(700);
      const r = await new AxeBuilder({ page }).analyze();
      const { own, embedded } = splitByFrame(r.violations);
      pages.push({ page: name, violations: own, embedded, passes: r.passes.length, incomplete: r.incomplete.map((v) => v.id) });
    }
  } finally {
    await context.close();
    shop.instances.delete(inst.id);
    shop.forget?.(inst.id);
  }
  const count = (list) => list.reduce((t, v) => t + v.nodes, 0);
  const total = pages.reduce((s, p) => s + count(p.violations), 0);
  const embedded = pages.reduce((s, p) => s + count(p.embedded), 0);
  return { engine: 'axe-core', rules: 'default (WCAG A/AA and best practices)', pages, totalViolations: total, embeddedViolations: embedded };
}
