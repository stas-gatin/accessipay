import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
for (const route of ['/customers']) {
  await p.goto('http://127.0.0.1:4300/#' + route, { waitUntil: 'networkidle' });
  const imgs = p.locator('.bimg-loaded');
  const n = await imgs.count();
  console.log(route, 'loaded brand images:', n, 'failed:', await p.locator('.bimg-failed').count());
  for (let i = 0; i < n; i++) {
    const sec = imgs.nth(i).locator('xpath=ancestor::section[1]');
    await sec.scrollIntoViewIfNeeded();
    await p.waitForTimeout(900);
    await sec.screenshot({ path: `${out}/sec-${route.replace('/', '') || 'home'}-${i}.png` });
  }
}
await b.close();
