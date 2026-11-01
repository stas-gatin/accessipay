// Screenshots of the analytics page in both themes at desktop and phone width.
// Run with the server up: node spike/analytics-shots.mjs [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.ACCESSIPAY_URL || 'http://127.0.0.1:4300';
const out = process.argv[2] || 'spike/shots/analytics';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [w, h, theme] of [[1280, 900, 'light'], [1280, 900, 'dark'], [390, 844, 'light'], [390, 844, 'dark']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => localStorage.setItem('accessipay-theme', t), theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/#/analytics`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ax-kpis');
  // Scroll through so every chart animates in, then come back up.
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += h / 2) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(120); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1300);
  const file = `${out}/analytics-${w}-${theme}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(file, `height=${height}`, errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
  await ctx.close();
}
await browser.close();
