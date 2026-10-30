// Audits the console itself: axe-core on every screen, plus horizontal overflow and clipped text,
// at a desktop and a phone width. Run with the server up: node spike/console-audit.mjs
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.ACCESSIPAY_URL || 'http://127.0.0.1:4300';
const runs = await (await fetch(`${BASE}/api/runs`)).json();
const done = runs.find((r) => r.outcome?.status === 'purchased' && r.patches?.length) || runs[0];
const screens = ['/#/', '/#/test', '/#/analytics', '/#/runs', '/#/defects', `/#/runs/${done.id}`];
const browser = await chromium.launch();
for (const [w, h, theme] of [[1280, 800, 'light'], [1280, 800, 'dark'], [390, 844, 'light'], [390, 844, 'dark']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((t) => localStorage.setItem('accessipay-theme', t), theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/AG Grid|License|\*{5}/.test(m.text())) errors.push(m.text()); });
  for (const s of screens) {
    await page.goto(BASE + s, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const axe = await new AxeBuilder({ page }).analyze();
    const layout = await page.evaluate(() => {
      const over = document.documentElement.scrollWidth > window.innerWidth + 1;
      const clipped = [...document.querySelectorAll('h1,h2,p,span,a,button,strong,div')].filter((el) => {
        const cs = getComputedStyle(el);
        return el.children.length === 0 && el.innerText?.trim() && cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
      }).length;
      return { horizontalScroll: over, clippedTexts: clipped };
    });
    console.log(`${w}px ${theme.padEnd(5)} ${s.padEnd(28)} axe=${axe.violations.map((v) => `${v.id}(${v.nodes.length})`).join(',') || 'none'} overflow=${layout.horizontalScroll} clipped=${layout.clippedTexts}`);
    for (const v of axe.violations) console.log(`   - ${v.id}: ${v.help} -> ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  }
  if (errors.length) console.log(`${w}px ${theme} errors:`, [...new Set(errors)].slice(0, 5));
}
await browser.close();
