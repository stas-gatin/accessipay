// HTTP app: the demo shop under /s/:iid, the JSON API under /api, run images under /runs-data.

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createShop } from './shop/instances.mjs';
import { DEFECTS } from './shop/defects.mjs';
import { PERSONAS } from './engine/session.mjs';
import { DEFAULT_GOAL } from './engine/prompts.mjs';
import { createRuns } from './engine/runs.mjs';
import { createPayPal } from './paypal/client.mjs';

export function createApp({ browser, dataDir, origin, brains = {}, env = process.env, extend }) {
  const paypal = createPayPal(env);
  const shop = createShop({ paypal });
  const runs = createRuns({ browser, shop, paypal, dataDir, origin, brains });
  const app = express();
  app.disable('x-powered-by');

  app.use('/s/:iid', shop.router);
  app.use('/runs-data', express.static(path.join(dataDir, 'runs'), { maxAge: '1h' }));
  app.use('/api', express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, paypal: paypal.mode, brains: ['external', 'scripted', ...Object.keys(brains)] }));
  app.get('/api/meta', (req, res) => res.json({ defects: DEFECTS, personas: PERSONAS, goal: DEFAULT_GOAL, paypal: paypal.mode, brains: ['external', 'scripted', ...Object.keys(brains)] }));

  app.post('/api/instances', (req, res) => {
    try {
      const inst = shop.create({ defects: req.body.defects || [] });
      res.json({ id: inst.id, url: `${origin}/s/${inst.id}/`, defects: inst.defects });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/instances/:iid', (req, res) => {
    const inst = shop.get(req.params.iid);
    if (!inst) return res.status(404).json({ error: 'not found' });
    res.json({ id: inst.id, defects: inst.defects, patches: inst.patches, order: inst.order });
  });

  app.post('/api/runs', (req, res) => {
    try {
      const rec = runs.start(req.body || {});
      res.json({ id: rec.id, instanceId: rec.instanceId, shopUrl: `${origin}/s/${rec.instanceId}/` });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/runs', (req, res) => res.json(runs.list()));
  app.get('/api/runs/:id', (req, res) => {
    const r = runs.get(req.params.id);
    if (!r) return res.status(404).json({ error: 'not found' });
    res.json(r.brain ? runs.plain(r) : r);
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

  extend?.(app, { shop, runs, paypal, browser });
  return { app, shop, runs, paypal };
}

export function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
