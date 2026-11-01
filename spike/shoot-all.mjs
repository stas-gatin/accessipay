// Screens of every page for a design review: each page in viewport-sized frames, top to bottom,
// at desktop and phone width, light and dark. Motion off so every block is visible.
//   ACCESSIPAY_URL=... node spike/shoot-all.mjs <outDir> [route ...]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.ACCESSIPAY_URL || 'http://127.0.0.1:4300';
const [out, ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const routes = only.length ? only : ['/', '/method', '/customers', '/paypal', '/results', '/analytics', '/own-site', '/test', '/runs/20261030-c2dca6', '/runs/20261031-fedeb7', '/sites/Retailer%20AJ', '/report/case/20261030-cea700'];
const b = await chromium.launch();
const shots = [];
for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
  for (const theme of ['light', 'dark']) {
    if (tag === 'phone' && theme === 'dark') continue;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('accessipay-theme', t); } catch {} }, theme);
    const p = await ctx.newPage();
    for (const r of routes) {
      await p.goto(`${BASE}/#${r}`, { waitUntil: 'networkidle' });
      await p.waitForTimeout(900);
      const total = await p.evaluate(() => document.body.scrollHeight);
      const name = r === '/' ? 'home' : r.replace(/^\//, '').replace(/[^\w-]+/g, '_');
      const frames = Math.min(14, Math.ceil(total / h));
      for (let i = 0; i < frames; i++) {
        await p.evaluate((y) => window.scrollTo(0, y), i * h);
        await p.waitForTimeout(150);
        const file = `${out}/${name}-${tag}-${theme}-${String(i + 1).padStart(2, '0')}.png`;
        await p.screenshot({ path: file });
        shots.push(file);
      }
    }
    await ctx.close();
  }
}
await b.close();
console.log(shots.length, 'screens in', out);
