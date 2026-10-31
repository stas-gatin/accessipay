// One analysis per site across customer types.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSiteAnalysis } from '../server/site-analysis.mjs';

const run = (id, persona, status, findings = []) => ({
  id, persona, status: 'finished', brainKind: 'external', createdAt: `2026-10-30T10:0${id.slice(-1)}:00Z`,
  site: { host: 'shop.example', url: 'https://shop.example/' }, outcome: { status }, steps: 10, findings,
  events: [{ type: 'decide', step: 9, action: status === 'blocked' ? 'give_up' : 'done', thought: `${persona} reason` }],
});

test('a site analysis joins every customer type and finds shared problems', () => {
  const all = [
    run('r1', 'screenreader', 'reached-payment', [{ page: 'Cart', problem: 'The remove button has no accessible name', step: 4 }]),
    run('r2', 'keyboard', 'blocked', [{ page: 'Cart', problem: 'The remove button is unnamed and focus is lost', step: 7 }]),
    run('r3', 'agent', 'not-testable'),
    run('r4', 'keyboard', 'error'),
  ];
  const runs = { list: () => all, get: (id) => all.find((r) => r.id === id) };
  const sites = createSiteAnalysis({ runs, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'accessipay-sites-')) });
  const [s] = sites.list();
  assert.equal(s.key, 'shop.example');
  assert.equal(s.tested, 2);
  assert.equal(s.reached, 1);
  assert.equal(s.customers.keyboard.id, 'r2'); // the errored later run does not hide the counted one
  const full = sites.get('shop.example');
  assert.equal(full.customers.find((c) => c.persona === 'keyboard').run.reason, 'keyboard reason');
  const named = full.themes.find((t) => /Unnamed/.test(t.theme));
  assert.deepEqual(named.personas.sort(), ['keyboard', 'screenreader']);
});
