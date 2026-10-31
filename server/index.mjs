// Entry point: node server/index.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createApp, loadEnv } from './app.mjs';
import { anthropicBrain } from './engine/brains/anthropic.mjs';
import { anthropicFixer } from './fixer/fixer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(path.join(root, '.env'));

const port = Number(process.env.PORT || 4300);
// The shopper's browser runs next to the server, so it always reaches the shop on loopback.
const origin = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const brains = { anthropic: (opts) => anthropicBrain({ model: opts.model }) };
const { app, paypal } = createApp({ browser, dataDir: path.join(root, 'data'), origin, brains, fixers: { anthropic: () => anthropicFixer() } });

// The private view shows real shop names and screenshots: it only listens on this computer.
const host = process.env.ACCESSIPAY_PRIVATE_VIEW === '1' ? '127.0.0.1' : '0.0.0.0';
app.listen(port, host, () => console.log(`AccessiPay on port ${port} (PayPal: ${paypal.mode}, Claude API: ${process.env.ANTHROPIC_API_KEY ? 'on' : 'off'})`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await browser.close(); process.exit(0); });
