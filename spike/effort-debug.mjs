// Debug: the effort block's bar widths and in-view class.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://127.0.0.1:4300/#/', { waitUntil: 'networkidle' });
await p.locator('.effort').scrollIntoViewIfNeeded();
await p.waitForTimeout(1500);
console.log(await p.evaluate(() => {
  const e = document.querySelector('.effort');
  const s = e.querySelector('.effort-bar span');
  const cs = getComputedStyle(s);
  return { cls: e.className, style: s.getAttribute('style'), width: cs.width, display: cs.display, bg: cs.backgroundColor, cell: s.parentElement.getBoundingClientRect().width };
}));
await b.close();
