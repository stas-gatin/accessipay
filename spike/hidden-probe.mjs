// Which revealed block stays hidden on a page, and why.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://127.0.0.1:4300/#' + process.argv[2], { waitUntil: 'networkidle' });
const h = await p.evaluate(() => document.body.scrollHeight);
for (let y = 0; y < h; y += 500) { await p.evaluate((v) => window.scrollTo(0, v), y); await p.waitForTimeout(90); }
await p.waitForTimeout(900);
console.log(await p.evaluate(() => [...document.querySelectorAll('.arv:not(.arv-in)')].map((e) => {
  const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
  return { tag: e.tagName, cls: e.className.slice(0, 80), w: r.width, h: r.height, display: cs.display, parent: e.parentElement.className.slice(0, 60) };
})));
await b.close();
