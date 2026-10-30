// One-off check: does the Vendure demo checkout render a shipping form at all (mouse, no keyboard)?
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
await p.goto('https://remix-storefront.vendure.io/products/cordless-mouse', { waitUntil: 'load' });
await p.waitForTimeout(3000);
await p.getByRole('button', { name: /add to cart/i }).first().click();
await p.waitForTimeout(3000);
await p.goto('https://remix-storefront.vendure.io/checkout', { waitUntil: 'load' });
await p.waitForTimeout(6000);
console.log('inputs on checkout:', await p.locator('input:visible, select:visible').count());
console.log('text sample:', (await p.locator('main').innerText().catch(() => '')).slice(0, 300).replace(/\n+/g, ' | '));
console.log('errors:', errors.slice(0, 5));
await p.screenshot({ path: process.argv[2] });
await b.close();
