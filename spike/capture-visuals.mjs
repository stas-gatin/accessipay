// Captures the console's illustrations from the real demo shop: full pages and one crop per defect.
// Output: console/public/img/. Run: node spike/capture-visuals.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createApp, loadEnv } from '../server/app.mjs';
import { DEFECTS } from '../server/shop/defects.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(path.join(root, '.env'));
const out = path.join(root, 'console', 'public', 'img');
fs.mkdirSync(path.join(out, 'defects'), { recursive: true });

const browser = await chromium.launch();
const port = 4990;
const origin = `http://127.0.0.1:${port}`;
const { app, shop } = createApp({ browser, dataDir: path.join(root, 'data'), origin, env: process.env });
const server = app.listen(port);
const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
const page = await context.newPage();

const SHIPPING = { name: 'Alex Morgan', email: 'alex.morgan@example.com', street: '12 Market Street', city: 'Springfield', zip: '62701', country: 'US', delivery: 'standard' };
function instance(defects, { cart = true, shipping = false } = {}) {
  const inst = shop.create({ defects });
  if (cart) inst.cart = [{ sku: 'bp-01', name: 'Trail Backpack', price: 49, qty: 1 }];
  if (shipping) inst.shipping = { ...SHIPPING };
  return inst;
}
async function open(inst, p) {
  await page.goto(`${origin}/s/${inst.id}${p}`, { waitUntil: 'load' });
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${origin}/s/${inst.id}${p}`, { waitUntil: 'load' });
  await page.waitForTimeout(700);
}
async function full(name) {
  await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 86 });
  console.log('page', name);
}
async function crop(name, selector, pad = 14) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) { console.log('MISSING', name, selector); return; }
  await page.screenshot({ path: path.join(out, 'defects', `${name}.png`), clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 } });
  console.log('crop', name);
}

// Full pages for the story sections.
await open(instance([], { cart: false }), '/'); await full('shop-catalog');
await open(instance(['focus-trap-modal']), '/cart'); await full('shop-cart-trap');
await open(instance(['div-pay-button'], { shipping: true }), '/pay'); await full('shop-pay-div');
const paid = JSON.parse(fs.readFileSync(path.join(root, 'data', 'runs', '20261030-a29ad7.json'), 'utf8'));
await open(shop.get(paid.instanceId), '/done'); await full('shop-done-sandbox');

// One crop per defect: it looks fine, and that is the point.
const where = {
  'meaningless-button-names': ['/', '.grid li:first-child'],
  'mousedown-add-to-cart': ['/', '.grid li:first-child'],
  'div-pay-button': ['/pay', '#pay'],
  'placeholder-only-card-fields': ['/pay', '#pay'],
  'focus-trap-modal': ['/cart', '.modal'],
  'unnamed-checkout-link': ['/cart', '.panel'],
  'focus-lost-on-update': ['/cart', '#lines'],
  'swapped-labels': ['/checkout', 'fieldset:nth-of-type(1)'],
  'unlabeled-city-field': ['/checkout', 'fieldset:nth-of-type(2)'],
  'custom-country-dropdown': ['/checkout', 'fieldset:nth-of-type(2)'],
  'fake-terms-checkbox': ['/checkout', '#checkout'],
  'silent-validation': ['/checkout', 'main'],
};
for (const d of DEFECTS) {
  const [p, sel] = where[d.id];
  await open(instance([d.id], { shipping: p === '/pay' }), p);
  if (d.id === 'custom-country-dropdown') await page.click('#country-current');
  if (d.id === 'silent-validation') { await page.click('button.primary'); await page.waitForTimeout(500); }
  await crop(d.id, sel);
}

server.close();
await browser.close();
