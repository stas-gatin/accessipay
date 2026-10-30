// The "scanner" side of the comparison: a standard axe-core scan (all default rules, including
// best practices) of every page of the checkout flow, with a filled cart so every page renders fully.

import AxeBuilder from '@axe-core/playwright';
import { PAGE_PATHS } from '../shop/instances.mjs';

const FLOW = ['catalog', 'cart', 'checkout', 'pay'];

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
      pages.push({
        page: name,
        violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.map((n) => n.target.join(' ')).slice(0, 5) })),
        passes: r.passes.length,
        incomplete: r.incomplete.map((v) => v.id),
      });
    }
  } finally {
    await context.close();
    shop.instances.delete(inst.id);
  }
  const total = pages.reduce((s, p) => s + p.violations.reduce((t, v) => t + v.nodes, 0), 0);
  return { engine: 'axe-core', rules: 'default (WCAG A/AA and best practices)', pages, totalViolations: total };
}
