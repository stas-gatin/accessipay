// Prints the new per-step fields (target boxes, focus boxes, stage, timing, keys) for a short scripted run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../server/app.mjs';

const browser = await chromium.launch();
const port = 4995;
const ctx = createApp({ browser, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ap-inspect-')), origin: `http://127.0.0.1:${port}`, env: {} });
const server = ctx.app.listen(port);
const script = JSON.parse(fs.readFileSync(new URL('../test/fixtures/agent-purchase.json', import.meta.url), 'utf8'));
const runs = [
  ctx.runs.start({ persona: 'agent', brain: 'scripted', script, defects: ['div-pay-button'] }),
  ctx.runs.start({ persona: 'keyboard', brain: 'scripted', script: [{ action: 'next' }, { action: 'next' }, { action: 'activate' }, { action: 'type', args: { text: 'abc' } }, { action: 'give_up', findings: [] }] }),
];
for (const rec of runs) {
  while (ctx.runs.get(rec.id).status !== 'finished') await new Promise((r) => setTimeout(r, 200));
  const r = ctx.runs.get(rec.id);
  console.log(`\n== ${r.persona} ${r.outcome.status}`);
  for (const e of r.events) {
    if (e.type === 'observe') console.log(`obs ${e.step} stage=${e.stage} focus=${JSON.stringify(e.focus)}`);
    if (e.type === 'target') console.log(`  target ${e.role || ''} "${e.name || ''}" box=${JSON.stringify(e.box)} missing=${!!e.missing} tag=${e.tag || ''} img=${e.image || ''}`);
    if (e.type === 'act') console.log(`  act ok=${e.ok} keys=${e.keys} actMs=${e.actMs} ${e.result.slice(0, 60)}`);
  }
}
server.close();
await browser.close();
