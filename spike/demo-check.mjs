// One-off: does a demo store's Add to cart work with a mouse? node spike/demo-check.mjs <product url> <button name regex> <out.png>
import { chromium } from 'playwright';
const [url, name, out] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
p.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url().slice(0, 100)}`); });
await p.goto(url, { waitUntil: 'load' });
await p.waitForTimeout(4000);
await p.getByRole('button', { name: new RegExp(name, 'i') }).first().click({ timeout: 10000 }).catch((e) => errors.push('click: ' + e.message.split('\n')[0]));
await p.waitForTimeout(8000);
console.log('buttons now:', (await p.getByRole('button').allInnerTexts()).filter((t) => /cart|loading/i.test(t)).slice(0, 5));
console.log('errors:', errors.slice(0, 8));
await p.screenshot({ path: out });
await b.close();
