// Screenshot of the own-site page with a saved site, after Check access and the AI agent check.
import { chromium } from 'playwright';
const [id, out] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.addInitScript((v) => { try { localStorage.setItem('accessipay-own-site', v); } catch {} }, id);
await p.goto('http://127.0.0.1:4300/#/own-site', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Check access' }).click();
await p.getByText(/With the key/).waitFor({ timeout: 90000 });
await p.getByRole('button', { name: 'Check', exact: true }).click();
await p.getByText(/Can AI assistants shop here/).scrollIntoViewIfNeeded();
await p.locator('table.data').waitFor({ timeout: 90000 });
await p.screenshot({ path: out, fullPage: true });
console.log(await p.locator('[aria-live]').allInnerTexts());
await b.close();
