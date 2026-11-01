// Debug: keyboard and screen reader focus through the PayPal Card Fields iframes on the pay page.
//   node spike/iframe-focus.mjs <pay page url> [keyboard|screenreader]
import { chromium } from 'playwright';
import { Session } from '../server/engine/session.mjs';
const [url, persona = 'keyboard'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(6000);
const s = new Session(page, persona, {});
for (let i = 0; i < 9; i++) {
  const t0 = Date.now();
  const r = await s.act({ action: 'next', args: {} });
  console.log(i + 1, `${Date.now() - t0}ms`, r, JSON.stringify(await s.focusBox()));
  if (/Card number/i.test(r)) {
    console.log('  type:', await s.act({ action: 'type', args: { text: '4111111111111111' } }));
    console.log('  after:', persona === 'keyboard' ? await s.focusForSighted() : await s.focusForScreenReader());
  }
}
await browser.close();
