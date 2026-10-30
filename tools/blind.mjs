// A "blind keyboard shopper" session: the brain (a person, a Claude Code agent, or later an API model)
// gets no pixels and no HTML. It can only ask for the accessibility tree and move through the page
// the way a keyboard / screen reader user does.
//
//   BLIND_PORT=4201 node tools/blind.mjs start <url>
//   BLIND_PORT=4201 node tools/blind.mjs tree | next | prev | activate | type <text> | verdict | stop
//
// `verdict` is for the harness, not for the brain. Every command is logged with a timestamp.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.BLIND_PORT || 4123);
const here = path.dirname(fileURLToPath(import.meta.url));
const logFile = path.resolve(here, `../spike/runs/blind-${PORT}.log`);
const [cmd, ...args] = process.argv.slice(2);

async function serve() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = (line) => fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);

  const tree = () => page.locator('body').ariaSnapshot();
  const focus = async () => {
    const loc = page.locator(':focus');
    if ((await loc.count()) === 0) return 'focus: nothing on the page is focused';
    try { return 'focus: ' + (await loc.first().ariaSnapshot()).trim(); } catch { return 'focus: an element with no name'; }
  };

  const handlers = {
    async open([url]) { await page.goto(url); return `opened, page title: ${await page.title()}`; },
    tree,
    async next() { await page.keyboard.press('Tab'); return focus(); },
    async prev() { await page.keyboard.press('Shift+Tab'); return focus(); },
    async activate() {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      return 'pressed Enter. Page now:\n' + (await tree());
    },
    async type(words) { await page.keyboard.type(words.join(' ')); return 'typed'; },
    async verdict() {
      return JSON.stringify({ purchase_completed: await page.evaluate(() => document.body.dataset.paid === 'yes') });
    },
    async stop() { setTimeout(() => process.exit(0), 50); return 'stopped'; },
  };

  http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { cmd: c, args: a } = JSON.parse(body || '{}');
    let out;
    try { out = handlers[c] ? await handlers[c](a) : `unknown command: ${c}`; } catch (e) { out = `error: ${e.message}`; }
    log(`${c} ${(a || []).join(' ')} -> ${String(out).split('\n')[0]}`);
    res.end(String(out));
  }).listen(PORT, '127.0.0.1');
}

function call(c, a) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, method: 'POST' }, (res) => {
      let d = '';
      res.on('data', (x) => (d += x));
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.end(JSON.stringify({ cmd: c, args: a }));
  });
}

if (cmd === 'serve') {
  await serve();
} else if (cmd === 'start') {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve'], { detached: true, stdio: 'ignore', env: process.env });
  child.unref();
  for (let i = 0; i < 50; i++) {
    try { console.log(await call('open', args)); process.exit(0); } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  console.error('server did not start');
  process.exit(1);
} else {
  console.log(await call(cmd, args));
}
