// Screenshot one section of the brand site by a CSS selector. node spike/section-shot.mjs <route> <selector> <out.png> [light|dark]
import { chromium } from 'playwright';
const [route, sel, out, theme = 'light'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
await p.addInitScript((t) => { try { localStorage.setItem('accessipay-theme', t); } catch {} }, theme);
await p.goto((process.env.ACCESSIPAY_URL || 'http://127.0.0.1:4300') + '/#' + route, { waitUntil: 'networkidle' });
const el = p.locator(sel).first();
await el.scrollIntoViewIfNeeded();
await p.waitForTimeout(1500);
await el.screenshot({ path: out });
await b.close();
