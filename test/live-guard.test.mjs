// A public demo with live runs: the access code, the one live model, the demo shop only, a daily limit,
// and live runs kept out of the published figures.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../server/app.mjs';

let browser, server, base;
before(async () => {
  browser = await chromium.launch();
  const port = 6100 + Math.floor(Math.random() * 300);
  base = `http://127.0.0.1:${port}`;
  const env = { ACCESSIPAY_ACCESS_CODE: 'judges-2026', ACCESSIPAY_LIVE_BRAIN: 'scripted', ACCESSIPAY_DAILY_RUNS: '1' };
  const ctx = createApp({ browser, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'accessipay-live-')), origin: base, env });
  await new Promise((ok) => { server = ctx.app.listen(port, ok); });
});
after(async () => { server?.close(); await browser?.close(); });

const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
const script = [{ action: 'give_up', args: {}, findings: [] }];

test('the console learns how live runs work here', async () => {
  const meta = await (await fetch(`${base}/api/meta`)).json();
  assert.equal(meta.live.brain, 'scripted');
  assert.equal(meta.live.codeRequired, true);
  assert.equal(meta.live.demoOnly, true);
  assert.equal(meta.live.left, 1);
});

test('a live run needs the code, the live model and the demo shop; the daily limit holds', async () => {
  assert.equal((await post('/api/runs', { persona: 'agent', brain: 'scripted', script })).status, 403, 'no code');
  assert.equal((await post('/api/runs', { persona: 'agent', brain: 'external', accessCode: 'judges-2026' })).status, 403, 'another model');
  assert.equal((await post('/api/site-tests', { url: 'https://example.com/', brain: 'scripted', accessCode: 'judges-2026' })).status, 403, 'a real shop');
  assert.equal((await post('/api/scan', { defects: [] })).status, 403, 'the scanner needs the code too');
  const ok = await post('/api/runs', { persona: 'agent', brain: 'scripted', script, accessCode: 'judges-2026' });
  assert.equal(ok.status, 200, ok.json.error);
  const over = await post('/api/runs', { persona: 'agent', brain: 'scripted', script, accessCode: 'judges-2026' });
  assert.equal(over.status, 429);
  assert.match(over.json.error, /used up/);
  const runs = await (await fetch(`${base}/api/runs`)).json();
  assert.equal(runs.find((r) => r.id === ok.json.id).liveDemo, true);
});
