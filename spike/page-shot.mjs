// Viewport screenshot of a route at a given width (motion off). node spike/page-shot.mjs <route> <out.png> [width] [scrollY]
import { chromium } from 'playwright';
const [route, out, width = '1440', y = '0'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(width), height: 900 }, reducedMotion: 'reduce' });
await p.goto((process.env.ACCESSIPAY_URL || 'http://127.0.0.1:4300') + '/#' + route, { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
await p.evaluate((v) => window.scrollTo(0, v), Number(y));
await p.waitForTimeout(300);
await p.screenshot({ path: out });
await b.close();
