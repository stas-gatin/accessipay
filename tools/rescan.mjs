// Re-runs the axe-core scan for recorded demo-shop runs with the current scanner, on the same
// defects and the same patches the run had. Real-site runs are skipped: their scan was taken live.
//   node tools/rescan.mjs <runId> [runId ...]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createApp, loadEnv } from '../server/app.mjs';
import { scanShop } from '../server/scan/axe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(path.join(root, '.env'));
const recorded = path.join(root, 'data', 'recorded');
const instances = path.join(root, 'data', 'instances');

const browser = await chromium.launch();
const port = 5600 + Math.floor(Math.random() * 300);
const origin = `http://127.0.0.1:${port}`;
const ctx = createApp({ browser, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'accessipay-rescan-')), origin, env: process.env });
const server = await new Promise((ok) => { const s = ctx.app.listen(port, () => ok(s)); });

try {
  for (const id of process.argv.slice(2)) {
    const file = path.join(recorded, `${id}.json`);
    if (!fs.existsSync(file)) { console.log(`skip ${id}: not recorded`); continue; }
    const run = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (run.site) { console.log(`skip ${id}: real site`); continue; }
    let patches = [];
    if (run.patches?.length) {
      const inst = JSON.parse(fs.readFileSync(path.join(instances, `${run.instanceId}.json`), 'utf8'));
      patches = inst.patches.filter((p) => run.patches.includes(p.id || p.find.slice(0, 40)));
      if (patches.length !== run.patches.length) { console.log(`skip ${id}: patches not found on instance ${run.instanceId}`); continue; }
    }
    run.scan = await scanShop({ browser, shop: ctx.shop, origin, defects: run.defects, patches });
    fs.writeFileSync(file, JSON.stringify(run));
    console.log(`${id}: ${run.persona}, ${run.defects.join(',') || 'clean'}, ${patches.length} patches -> shop ${run.scan.totalViolations}, inside embedded frames ${run.scan.embeddedViolations}`);
  }
} finally {
  server.close();
  await browser.close();
}
