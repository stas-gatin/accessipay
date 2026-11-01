// Full-page screenshots of the brand site at desktop and phone widths, both themes.
// Usage: node spike/site-shots.mjs [outDir] [route ...]   (server running on ACCESSIPAY_URL or :4300)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.ACCESSIPAY_URL || 'http://127.0.0.1:4300';
const out = process.argv[2] || 'spike/site-shots';
const routes = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/method', '/customers', '/paypal', '/honesty'];
const sizes = (process.env.SIZES || '1440x900,390x844').split(',').map((s) => s.split('x').map(Number));
const themes = (process.env.THEMES || 'light,dark').split(',');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const [w, h] of sizes) {
  for (const theme of themes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
    await ctx.addInitScript((t) => localStorage.setItem('accessipay-theme', t), theme);
    const page = await ctx.newPage();
    for (const r of routes) {
      await page.goto(`${BASE}/#${r}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      // Scroll through the page so every reveal and count-up has run, then back to the top.
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += Math.round(h * 0.6)) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(160); }
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      const name = `${r === '/' ? 'home' : r.slice(1).replace(/\//g, '-')}-${w}-${theme}.png`;
      await page.screenshot({ path: path.join(out, name), fullPage: true });
      console.log(path.join(out, name));
    }
    await ctx.close();
  }
}
await browser.close();
