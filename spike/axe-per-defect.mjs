// Measures what axe-core reports for each defect switched on alone. Run: node spike/axe-per-defect.mjs
import { chromium } from 'playwright';
import { createApp } from '../server/app.mjs';
import { scanShop } from '../server/scan/axe.mjs';
import { DEFECTS } from '../server/shop/defects.mjs';

const browser = await chromium.launch();
const origin = 'http://127.0.0.1:4892';
const { app, shop } = createApp({ browser, dataDir: '/tmp/accessipay-axe', origin, env: {} });
const server = app.listen(4892);
for (const d of [{ id: 'none' }, ...DEFECTS]) {
  const r = await scanShop({ browser, shop, origin, defects: d.id === 'none' ? [] : [d.id] });
  const v = r.pages.flatMap((p) => p.violations.map((x) => `${p.page}:${x.id}(${x.nodes})`));
  console.log(`${d.id.padEnd(30)} expected=${String(d.axeExpected ?? '-').padEnd(5)} violations=${r.totalViolations} ${v.join(' ')}`);
}
server.close();
await browser.close();
