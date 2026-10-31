import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto('http://127.0.0.1:4301/#/sites/Retailer%20D', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } });
console.log(await p.evaluate(() => { const h = document.querySelector('#site-name'); const e = h?.previousElementSibling; return [h?.className, getComputedStyle(h).opacity, h?.getBoundingClientRect().height, e?.className, e && getComputedStyle(e).opacity, h?.closest('.arv')?.className]; }));
await b.close();
