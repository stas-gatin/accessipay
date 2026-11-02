// HTTP app: the demo shop under /s/:iid, the JSON API under /api, run images under /runs-data.

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createShop } from './shop/instances.mjs';
import { DEFECTS } from './shop/defects.mjs';
import { PERSONAS } from './engine/session.mjs';
import { DEFAULT_GOAL, GOALS } from './engine/prompts.mjs';
import { createRuns } from './engine/runs.mjs';
import { createPayPal } from './paypal/client.mjs';
import { createFixes } from './fixer/fixer.mjs';
import { scanShop } from './scan/axe.mjs';
import { analytics } from './analytics.mjs';
import { runMetrics } from './metrics.mjs';
import { mountReports } from './report/routes.mjs';
import { createOwnerSites, KEY_HEADER, keyGoesTo } from './owners.mjs';
import { checkAgentAccess } from './agent-access.mjs';
import { createSiteAnalysis, siteKey } from './site-analysis.mjs';
import { createTestShop } from './test-shop.mjs';
import { verifyFindings } from './verify.mjs';
import { detectBotWall } from './engine/preflight.mjs';
import { createMask } from './anonymize.mjs';
import { DEFAULT_MODEL as NVIDIA_DEFAULT_MODEL } from './engine/brains/nvidia.mjs';

export function createApp({ browser, dataDir, origin, brains = {}, fixers = {}, env = process.env, extend }) {
  const paypal = createPayPal(env);
  const shop = createShop({ paypal, dataDir });
  // Shops on this computer (localhost) can be tested only in local development and tests.
  const allowLocal = env.ACCESSIPAY_LOCAL_SITES === '1';
  // Chromium sends *.localhost to this computer by itself; Node's fetch needs to be told.
  const fetchImpl = allowLocal ? (url, o) => fetch(String(url).replace(/^(https?:\/\/)[^/:]+\.localhost(?=[:/])/i, '$1127.0.0.1'), o) : fetch;
  const sandboxKeys = ({ clientId, secret }) => createPayPal({ PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: secret });
  const owners = createOwnerSites({ dataDir, allowLocal, sandboxKeys, fetchImpl });
  // Private view (ACCESSIPAY_PRIVATE_VIEW=1, this computer only): real shop names, page text and screenshots.
  const privateView = env.ACCESSIPAY_PRIVATE_VIEW === '1';
  const runs = createRuns({ browser, shop, paypal, dataDir, origin, brains, owners, privateView, allowLocal });
  // Live runs on large retailers are shown under their label, like the recorded ones.
  const mask = privateView ? (r) => r : createMask(dataDir);
  const sites = createSiteAnalysis({ runs: { list: () => runs.list().map(mask), get: (id) => mask(runs.get(id)) }, dataDir });
  const testShop = createTestShop({ runs: { get: (id) => mask(runs.get(id)) }, dataDir });
  const fixes = createFixes({ shop, runs, origin, fixers, dataDir });
  const app = express();
  app.disable('x-powered-by');

  app.use('/s/:iid', shop.router);
  app.use('/runs-data', express.static(path.join(dataDir, 'runs'), { maxAge: '1h' }));
  app.use('/runs-data', express.static(path.join(dataDir, 'recorded'), { maxAge: '1h' }));
  app.use('/api', express.json({ limit: '1mb' }));

  const claudeReady = () => !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  // Live runs: which model decides each step. In a public demo (ACCESSIPAY_ACCESS_CODE set) a run starts
  // only with the code, only with that model, only on the demo shop, a few at a time and a few a day,
  // so visitors cannot spend the key or send our browser to other sites. These runs stay out of the
  // published figures (Analytics, home page).
  const liveBrain = env.ACCESSIPAY_LIVE_BRAIN || (claudeReady() ? 'anthropic' : env.NVIDIA_API_KEY ? 'nvidia' : null);
  const LIVE_LABEL = { anthropic: 'Claude', nvidia: 'NVIDIA Nemotron', external: 'a Claude Code agent' };
  const accessCode = String(env.ACCESSIPAY_ACCESS_CODE || '').trim();
  const demoOnly = !!accessCode && env.ACCESSIPAY_LIVE_DEMO_ONLY !== '0';
  const dailyRuns = Number(env.ACCESSIPAY_DAILY_RUNS || 20);
  const maxRunning = Number(env.ACCESSIPAY_MAX_RUNNING || 3);
  const quota = { day: '', used: 0 };
  const today = () => { const d = new Date().toISOString().slice(0, 10); if (quota.day !== d) Object.assign(quota, { day: d, used: 0 }); return quota; };
  const refuse = (status, message) => Object.assign(new Error(message), { status });
  function liveGuard(body, needed, kind = 'run') {
    if (!accessCode) return {};
    if (String(body?.accessCode || '').trim() !== accessCode) throw refuse(403, 'Enter the access code for live runs.');
    const asked = kind === 'fix' ? body.fixer : body.brain;
    if (asked !== liveBrain) throw refuse(403, `Live runs in this public demo use ${LIVE_LABEL[liveBrain] || 'no model'}.`);
    if (kind === 'fix') return {};
    if (demoOnly && (body.url || body.ownerSiteId)) throw refuse(403, 'Live runs in this public demo are limited to our demo shop.');
    if (runs.list().filter((r) => r.status === 'running').length + needed > maxRunning) throw refuse(429, 'Other live runs are going right now. Try again in a few minutes.');
    const q = today();
    if (q.used + needed > dailyRuns) throw refuse(429, 'Today\'s live runs are used up. Every recorded run can still be replayed.');
    q.used += needed;
    return { liveDemo: true };
  }
  const liveMeta = () => liveBrain ? {
    brain: liveBrain, label: LIVE_LABEL[liveBrain], model: liveBrain === 'nvidia' ? (env.NVIDIA_MODEL || NVIDIA_DEFAULT_MODEL) : liveBrain === 'anthropic' ? (env.ACCESSIPAY_MODEL || 'claude-opus-5-5') : null,
    fixer: fixers[liveBrain] ? liveBrain : null, codeRequired: !!accessCode, demoOnly, left: accessCode ? Math.max(0, dailyRuns - today().used) : null,
  } : null;
  app.get('/api/health', (req, res) => res.json({ ok: true, paypal: paypal.mode, claude: claudeReady(), brains: ['external', 'scripted', ...Object.keys(brains)] }));
  app.get('/api/meta', (req, res) => res.json({ privateView, live: liveMeta(), defects: DEFECTS, personas: PERSONAS, goal: DEFAULT_GOAL, goals: Object.fromEntries(Object.entries(GOALS).map(([k, g]) => [k, { label: g.label, text: g.text || DEFAULT_GOAL }])), paypal: paypal.mode, claude: claudeReady(), brains: ['external', 'scripted', ...Object.keys(brains)] }));

  app.post('/api/instances', (req, res) => {
    try {
      const inst = shop.create({ defects: req.body.defects || [] });
      res.json({ id: inst.id, url: `/s/${inst.id}/`, defects: inst.defects });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/instances/:iid', (req, res) => {
    const inst = shop.get(req.params.iid);
    if (!inst) return res.status(404).json({ error: 'not found' });
    res.json({ id: inst.id, defects: inst.defects, patches: inst.patches, order: inst.order });
  });

  app.post('/api/runs', (req, res) => {
    try {
      const guard = liveGuard(req.body || {}, 1);
      const rec = runs.start({ ...(req.body || {}), ...guard });
      res.json({ id: rec.id, instanceId: rec.instanceId, shopUrl: rec.site ? rec.site.url : `/s/${rec.instanceId}/` });
    } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });
  app.get('/api/runs', (req, res) => res.json(runs.list().map(mask)));

  // One analysis per site, across every customer type.
  app.get('/api/sites', (req, res) => res.json(sites.list()));
  app.get('/api/sites/:key', (req, res) => {
    const s = sites.get(req.params.key);
    return s ? res.json(s) : res.status(404).json({ error: 'No runs on this site yet' });
  });
  // Our own test shop: planted problems, the AI fix, and the same customer paying through PayPal afterwards.
  app.get('/api/test-shop', (req, res) => res.json(testShop.list()));
  app.get('/api/test-shop/:key', (req, res) => {
    const c = testShop.get(req.params.key);
    return c ? res.json(c) : res.status(404).json({ error: 'No such case' });
  });
  // Test a site with all three customer types at once; the site report shows them together.
  app.post('/api/site-tests', (req, res) => {
    try {
      const b = req.body || {};
      const personas = (b.personas?.length ? b.personas : ['screenreader', 'keyboard', 'agent']).filter((p) => ['screenreader', 'keyboard', 'agent'].includes(p));
      const guard = liveGuard({ ...b, brain: b.brain || 'external' }, personas.length);
      const started = personas.map((persona) => runs.start({ persona, url: b.url, brain: b.brain || 'external', ownerSiteId: b.ownerSiteId, payInSandbox: !!b.payInSandbox, label: b.payInSandbox ? 'sandbox purchase' : 'site test', ...guard }));
      res.json({ key: siteKey(started[0].site), runs: started.map((r) => ({ id: r.id, persona: r.persona })) });
    } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });

  // Owners test their own site: verify the domain, then let AccessiPay's browser through their bot protection.
  app.post('/api/owner-sites', (req, res) => {
    try { res.json(owners.add(req.body?.url)); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/owner-sites/:id', (req, res) => {
    const s = owners.get(req.params.id);
    return s ? res.json(s) : res.status(404).json({ error: 'not found' });
  });
  app.post('/api/owner-sites/:id/verify', async (req, res) => {
    try { res.json(await owners.verify(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  // The owner's PayPal sandbox: runs on their staging checkout pay with a test card, and PayPal confirms.
  app.post('/api/owner-sites/:id/sandbox', async (req, res) => {
    try { res.json(await owners.connectSandbox(req.params.id, req.body || {})); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.delete('/api/owner-sites/:id/sandbox', (req, res) => {
    try { res.json(owners.disconnectSandbox(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  // One page load without the key and one with it: does the owner's rule let the browser in?
  app.post('/api/owner-sites/:id/check', async (req, res) => {
    const s = owners.raw(req.params.id);
    if (!s) return res.status(404).json({ error: 'not found' });
    if (!s.verified) return res.status(400).json({ error: 'Verify the site first' });
    const load = async (withKey) => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      const page = await context.newPage();
      if (withKey) await context.route('**/*', (route) => {
        let host = '';
        try { host = new URL(route.request().url()).hostname; } catch {}
        return keyGoesTo(s.host, host) ? route.continue({ headers: { ...route.request().headers(), [KEY_HEADER]: s.key } }) : route.continue();
      });
      try {
        const r = await page.goto(s.url, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(2000);
        const status = r?.status() ?? null;
        const wall = status >= 400 ? `HTTP ${status}` : await detectBotWall(page);
        return { status, wall, title: (await page.title()).slice(0, 80) };
      } catch (e) {
        return { status: null, wall: `the page did not load (${String(e.message || e).split('\n')[0].slice(0, 80)})`, title: '' };
      } finally { await context.close(); }
    };
    const without = await load(false);
    const withKey = await load(true);
    const check = { at: new Date().toISOString(), withoutKey: without, withKey, ready: !withKey.wall };
    owners.recordCheck(s.id, check);
    res.json(check);
  });

  // Can AI assistants shop here? Reads the site's own rules and loads its home page once.
  app.get('/api/agent-access', async (req, res) => {
    try { res.json(await checkAgentAccess(req.query.url, { browser, allowLocal, fetchImpl })); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/runs/:id', (req, res) => {
    const r = runs.get(req.params.id);
    if (!r) return res.status(404).json({ error: 'not found' });
    const plain = mask(r.brain ? runs.plain(r) : r);
    // Each finding is checked against the record of the run (page snapshot, focus, axe-core), not by AI.
    res.json(plain.status === 'finished' ? { ...plain, checks: verifyFindings(plain) } : plain);
  });
  app.get('/api/runs/:id/metrics', (req, res) => {
    const r = runs.get(req.params.id);
    if (!r) return res.status(404).json({ error: 'not found' });
    res.json(runMetrics(r.brain ? runs.plain(r) : r));
  });
  app.post('/api/runs/:id/stop', (req, res) => res.json({ ok: runs.stop(req.params.id) }));

  // Server-sent events: everything that already happened, then live events.
  app.get('/api/runs/:id/events', (req, res) => {
    const r = runs.get(req.params.id);
    if (!r) return res.status(404).end();
    res.set({ 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.flushHeaders();
    const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    r.events.forEach(send);
    if (r.status !== 'running') return res.end();
    const off = runs.subscribe(r.id, (e) => { send(e); if (e.type === 'finished') res.end(); });
    req.on('close', off);
  });

  // External brain: fetch the pending turn (long poll) and submit a decision.
  app.get('/api/runs/:id/turn', async (req, res) => {
    const r = runs.runs.get(req.params.id);
    if (!r || r.brainKind !== 'external') return res.status(404).json({ error: 'no external run with this id' });
    if (r.status !== 'running') return res.json({ finished: true, outcome: r.outcome });
    const turn = await Promise.race([r.brain.nextTurn(), new Promise((ok) => setTimeout(() => ok(null), 25000))]);
    if (r.status !== 'running') return res.json({ finished: true, outcome: r.outcome });
    res.json(turn ? { finished: false, ...turn } : { finished: false, waiting: true });
  });
  app.post('/api/runs/:id/decision', (req, res) => {
    const r = runs.runs.get(req.params.id);
    if (!r || r.brainKind !== 'external') return res.status(404).json({ error: 'no external run with this id' });
    res.json(r.brain.submit(req.body?.text ?? req.body));
  });

  app.post('/api/instances/:iid/reset', (req, res) => {
    const inst = shop.get(req.params.iid);
    if (!inst) return res.status(404).json({ error: 'not found' });
    inst.patches = [];
    shop.save(inst);
    res.json({ ok: true });
  });

  // axe-core scan of the whole flow for a set of defects (and optionally the patches of an instance).
  app.post('/api/scan', async (req, res) => {
    try {
      if (accessCode && String(req.body?.accessCode || '').trim() !== accessCode) return res.status(403).json({ error: 'Enter the access code for live runs.' });
      const inst = req.body.instanceId ? shop.get(req.body.instanceId) : null;
      res.json(await scanShop({ browser, shop, origin, defects: inst ? inst.defects : (req.body.defects || []), patches: inst ? inst.patches : [] }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/fixes', (req, res) => {
    try {
      liveGuard(req.body || {}, 0, 'fix');
      const job = fixes.start(req.body || {});
      res.json({ id: job.id, page: job.page, status: job.status });
    } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });
  app.get('/api/fixes', (req, res) => res.json(fixes.list().map(({ prompt, system, preview, ...j }) => j)));
  app.get('/api/fixes/:id', (req, res) => {
    const job = fixes.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'not found' });
    res.json(req.query.full ? job : (({ prompt, system, ...j }) => j)(job));
  });
  app.post('/api/fixes/:id/reply', (req, res) => {
    const r = fixes.submit(req.params.id, req.body?.text ?? JSON.stringify(req.body));
    if (!r.ok) return res.status(400).json({ error: r.error || r.job?.error, job: r.job && (({ prompt, system, ...j }) => j)(r.job) });
    res.json((({ prompt, system, ...j }) => j)(r.job));
  });

  app.get('/api/analytics', (req, res) => {
    const all = runs.list().map((r) => runs.get(r.id)).map((r) => mask(r && r.brain ? runs.plain(r) : r));
    res.json(analytics(all));
  });

  app.get('/api/eval', (req, res) => {
    const file = path.join(dataDir, 'eval', 'results.json');
    if (!fs.existsSync(file)) return res.json(null);
    res.type('json').send(fs.readFileSync(file, 'utf8'));
  });

  // The console (built with Vite) and its client-side routes.
  const consoleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'console', 'dist');
  if (fs.existsSync(consoleDir)) {
    // Hashed assets can be cached for long; index.html never, so a new build shows up at once.
    app.use(express.static(consoleDir, {
      setHeaders: (res, file) => res.set('cache-control', file.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable'),
    }));
    app.get(/^\/(?!api|s\/|runs-data|report\/).*/, (req, res) => res.set('cache-control', 'no-cache').sendFile(path.join(consoleDir, 'index.html')));
  }

  mountReports(app, { shop, runs, paypal, browser, fixes, origin, dataDir });
  extend?.(app, { shop, runs, paypal, browser, fixes });
  return { app, shop, runs, paypal, fixes };
}

export function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
