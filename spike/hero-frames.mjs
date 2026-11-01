// Captures key frames of the home hero replay (blocked, fix, paid). Usage: node spike/hero-frames.mjs <outDir>
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch();
for (const [w, h, theme] of [[1440, 900, 'light'], [390, 844, 'dark']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => localStorage.setItem('accessipay-theme', t), theme);
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:4300/#/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const next = p.getByRole('button', { name: 'Next frame' });
  await next.scrollIntoViewIfNeeded();
  for (const target of [6, 7, 10]) {
    let label = '';
    for (let k = 0; k < 12; k++) {
      label = await p.locator('.rp-count').innerText();
      if (label.startsWith(`${target} /`)) break;
      await next.click();
      await p.waitForTimeout(80);
    }
    await p.waitForTimeout(900);
    await p.locator('.rp').screenshot({ path: `${out}/frame-${target}-${w}-${theme}.png` });
    console.log(target, label);
  }
  await ctx.close();
}
await b.close();
