// Screenshots of a run while it is live (for example an external-brain run waiting for its next decision).
// node spike/capture-live.mjs <runId> [outDir]
import { chromium } from 'playwright';
const [id, out = 'spike/runs/theater'] = process.argv.slice(2);
const b = await chromium.launch();
for (const [w, h, t] of [[1440, 900, 'light'], [390, 844, 'dark']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((t) => localStorage.setItem('accessipay-theme', t), t);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('err', e.message));
  await p.goto(`http://127.0.0.1:4300/#/runs/${id}`); await p.waitForSelector('.rv-now'); await p.waitForTimeout(3500);
  await p.screenshot({ path: `${out}/live-${w}-${t}.png` });
  console.log(await p.locator('[aria-live="polite"]').first().innerText().catch(() => ''));
  await ctx.close();
}
await b.close();
