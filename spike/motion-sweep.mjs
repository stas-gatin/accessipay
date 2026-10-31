// Scrolls every page top to bottom with motion on: every revealed block must end up visible, no errors.
import { chromium } from 'playwright';
const routes = ['/', '/method', '/customers', '/paypal', '/honesty', '/test', '/own-site', '/analytics', '/results', '/sites/demo.solidus.io', '/runs', '/defects', '/runs/20261030-c2dca6', '/report/case/20261030-cea700'];
const b = await chromium.launch();
for (const width of [1440, 390]) {
  const p = await b.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  for (const r of routes) {
    await p.goto('http://127.0.0.1:4300/#' + r, { waitUntil: 'networkidle' });
    await p.waitForTimeout(600);
    const h = await p.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < h; y += 500) { await p.evaluate((v) => window.scrollTo(0, v), y); await p.waitForTimeout(90); }
    await p.waitForTimeout(900);
    const r2 = await p.evaluate(() => ({
      hidden: [...document.querySelectorAll('.arv:not(.arv-in)')].length,
      revealed: document.querySelectorAll('.arv-in').length,
      rvHidden: [...document.querySelectorAll('.rv:not(.in)')].length,
    }));
    console.log(`${width} ${r.padEnd(30)} revealed ${String(r2.revealed).padStart(3)}  still hidden ${r2.hidden}  brand-hidden ${r2.rvHidden}`);
  }
  console.log(width, 'errors:', errors.length ? errors.slice(0, 5) : 'none');
  await p.close();
}
await b.close();
