// Spike: can our simulated customers perceive and use PayPal Card Fields (cross-origin iframes)?
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadEnv } from '../server/app.mjs';

loadEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'));
const CID = process.env.PAYPAL_CLIENT_ID;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Card Fields check</title></head><body><main>
<h1>Pay by card</h1>
<div id="name"></div><div id="number"></div><div id="expiry"></div><div id="cvv"></div>
<button id="pay" type="button">Pay $54.00</button>
</main>
<script src="https://www.paypal.com/sdk/js?client-id=${CID}&components=card-fields&currency=USD"></script>
<script>
const cf = paypal.CardFields({ createOrder: () => Promise.reject(new Error('spike only')), onApprove: () => {} });
window.cfEligible = cf.isEligible();
if (window.cfEligible) {
  cf.NameField().render('#name'); cf.NumberField().render('#number'); cf.ExpiryField().render('#expiry'); cf.CVVField().render('#cvv');
}
</script></body></html>`;
const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(html); }).listen(4997);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4997/');
await page.waitForTimeout(6000);
console.log('eligible:', await page.evaluate(() => window.cfEligible));
console.log('frames:', page.frames().map((f) => new URL(f.url() || 'about:blank').hostname).join(', '));
console.log('--- body ariaSnapshot ---\n' + (await page.locator('body').ariaSnapshot()).slice(0, 1200));
const card = page.frameLocator('iframe[title*="card" i], iframe[name*="number" i]').first();
for (const f of page.frames().slice(1)) {
  try { console.log(`--- frame ${new URL(f.url()).pathname.slice(0, 50)}\n` + (await f.locator('body').ariaSnapshot()).slice(0, 300)); } catch (e) { console.log('frame err', e.message.split('\n')[0]); }
}
// Keyboard: does Tab enter the iframes?
await page.keyboard.press('Tab');
for (let i = 0; i < 6; i++) {
  const info = await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName} ${a.getAttribute('title') || a.id || ''}` : 'none'; });
  console.log('tab', i, info);
  await page.keyboard.press('Tab');
}
await browser.close();
server.close();
