// Entry point: node server/index.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createApp, loadEnv } from './app.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(path.join(root, '.env'));

const port = Number(process.env.PORT || 4300);
const origin = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const { app, paypal } = createApp({ browser, dataDir: path.join(root, 'data'), origin });

app.listen(port, () => console.log(`AccessiPay on ${origin} (PayPal: ${paypal.mode})`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await browser.close(); process.exit(0); });
