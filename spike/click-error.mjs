// Prints what Playwright reports when a click is blocked by an overlay (message, log, other fields).
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent('<div id="promo" style="position:fixed;inset:0;background:#000a"></div><button>Buy</button>');
try { await p.getByRole('button', { name: 'Buy' }).click({ timeout: 2500 }); } catch (e) { console.log(JSON.stringify({ message: e.message, keys: Object.keys(e), log: e.log }, null, 1).slice(0, 1500)); }
await b.close();
