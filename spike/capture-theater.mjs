// Screenshots of the live run view (theater) for a few runs, at a desktop and a phone size, in both themes.
// Run with the server up: node spike/capture-theater.mjs [runId ...]
// Output: spike/runs/theater/<runId>-<width>-<theme>[-<step>].png
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.ACCESSIPAY_URL || 'http://127.0.0.1:4300';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['20261030-003839', '20261030-ee0cff', '20261030-a29ad7'];
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runs', 'theater');
fs.mkdirSync(out, { recursive: true });
const themes = (process.env.THEMES || 'light,dark').split(',');
const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (const theme of themes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => localStorage.setItem('accessipay-theme', t), theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    for (const id of ids) {
      await page.goto(`${BASE}/#/runs/${id}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.rv-now');
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(out, `${id}-${w}-${theme}.png`) });
      const axe = await new AxeBuilder({ page }).analyze();
      console.log(`${w}px ${theme} ${id} axe=${axe.violations.map((v) => `${v.id}(${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')})`).join(', ') || 'none'}`);
      // A step in the middle, chosen from the filmstrip, plus the full page once.
      const thumbs = page.locator('.rv-thumb');
      const n = await thumbs.count();
      if (n > 4) {
        await thumbs.nth(Math.floor(n * 0.55)).click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(out, `${id}-${w}-${theme}-mid.png`) });
      }
      if (theme === 'light') await page.screenshot({ path: path.join(out, `${id}-${w}-${theme}-full.png`), fullPage: true });
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`Saved to ${out}`);
