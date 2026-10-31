// Scrolls to a section with motion on and takes frames over time, to see animations actually run.
//   node spike/motion-check.mjs <route> <selector> <outPrefix> [frames] [gapMs]
import { chromium } from 'playwright';
const [route, sel, out, frames = '3', gap = '1200'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/AG Grid|License|\*{5}/.test(m.text())) errors.push(m.text()); });
await p.goto('http://127.0.0.1:4300/#' + route, { waitUntil: 'networkidle' });
const el = p.locator(sel).first();
await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
for (let i = 0; i < Number(frames); i++) {
  await p.waitForTimeout(Number(gap));
  await el.screenshot({ path: `${out}-${i + 1}.png` });
}
console.log('errors:', errors.length ? errors : 'none');
await b.close();
