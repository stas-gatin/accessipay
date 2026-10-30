// Real-site sweep over the private site list (data/private/sites.json, not committed).
//   node tools/sweep.mjs start <persona> platforms [name...]  -> one run per open-source platform demo (or those named)
//   node tools/sweep.mjs start <persona> retailers [label...] -> one run per retailer not visited today
//   node tools/sweep.mjs status                               -> runs of today's sweeps and where they are
//   node tools/sweep.mjs record                               -> records finished runs (retailers anonymized)
//   node tools/sweep.mjs not-testable <runId> <reason>        -> relabels a run whose site was not testable (bot page, maintenance, broken demo)
//   node tools/sweep.mjs reached <runId> <evidence>              -> relabels a run whose last screen shows the payment step (checked by hand)
// A large retailer is visited at most once a day, whatever the customer type; the visit log is
// data/private/visits.json. Runs use the external brain: a Claude Code agent decides each step.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.ACCESSIPAY_URL || 'http://127.0.0.1:4300';
const priv = path.join(root, 'data', 'private');
const sites = JSON.parse(fs.readFileSync(path.join(priv, 'sites.json'), 'utf8'));
const visitsFile = path.join(priv, 'visits.json');
const sweepsFile = path.join(priv, 'sweeps.json');
const read = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const today = new Date().toISOString().slice(0, 10);
const hostOf = (u) => new URL(u).hostname;

async function api(p, body) {
  const r = await fetch(BASE + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

const [cmd, persona, group, ...only] = process.argv.slice(2);

if (cmd === 'start') {
  if (!['screenreader', 'keyboard', 'agent'].includes(persona) || !['platforms', 'retailers'].includes(group)) {
    console.log('usage: start <screenreader|keyboard|agent> <platforms|retailers> [label ...]');
    process.exit(1);
  }
  const visits = read(visitsFile, {});
  const sweeps = read(sweepsFile, []);
  const pick = (name) => !only.length || only.some((o) => name.toLowerCase().includes(o.toLowerCase()));
  const list = group === 'platforms' ? sites.platforms.filter((p) => pick(p.name)) : sites.retailers.filter((r) => r.preflight === 'ok' && (!only.length || only.includes(r.label)));
  for (const s of list) {
    const host = hostOf(s.url);
    if (group === 'retailers' && (visits[host] || []).includes(today)) { console.log(`skip ${s.label}: already visited today`); continue; }
    const j = await api('/api/runs', { persona, url: s.url, brain: 'external', label: `${group === 'platforms' ? 'platform' : 'retailer'} sweep` });
    if (group === 'retailers') (visits[host] ||= []).push(today);
    sweeps.push({ id: j.id, date: today, persona, kind: group === 'platforms' ? 'platform' : 'retailer', label: s.label || s.name, recorded: false });
    console.log(`${j.id}  ${persona}  ${s.label || s.name}`);
  }
  fs.writeFileSync(visitsFile, JSON.stringify(visits, null, 2));
  fs.writeFileSync(sweepsFile, JSON.stringify(sweeps, null, 2));
} else if (cmd === 'status') {
  for (const s of read(sweepsFile, []).filter((x) => x.date === today)) {
    const r = await api(`/api/runs/${s.id}`).catch(() => null);
    console.log(`${s.id}  ${s.persona.padEnd(12)} ${s.label.padEnd(26)} ${r ? `${r.status} ${r.outcome?.status || ''}` : 'missing'}${s.recorded ? '  (recorded)' : ''}`);
  }
} else if (cmd === 'record') {
  const sweeps = read(sweepsFile, []);
  for (const s of sweeps.filter((x) => !x.recorded)) {
    const r = await api(`/api/runs/${s.id}`).catch(() => null);
    if (!r || r.status !== 'finished') continue;
    const args = [path.join(root, 'tools', 'record.mjs')];
    if (s.kind === 'retailer') {
      const site = sites.retailers.find((x) => x.label === s.label);
      const brands = [site.brand, hostOf(site.url).replace(/^www\./, '').split('.')[0]].join(',');
      args.push('--anon', s.label, '--brand', brands);
    }
    process.stdout.write(execFileSync('node', [...args, s.id]).toString());
    s.recorded = true;
  }
  fs.writeFileSync(sweepsFile, JSON.stringify(sweeps, null, 2));
} else if (cmd === 'not-testable') {
  // persona holds the run id here, group the reason.
  const id = persona;
  const reason = [group, ...only].join(' ');
  const file = path.join(root, 'data', 'runs', `${id}.json`);
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  r.outcome = { status: 'not-testable', reason: `${reason} Not counted as an accessibility result.`, reclassified: { from: r.outcome?.status, by: 'operator', why: reason } };
  // Findings made before the wall stay in the record; analytics leaves not-testable runs out.
  fs.writeFileSync(file, JSON.stringify(r));
  console.log(`${id} -> not-testable`);
} else if (cmd === 'reached') {
  const id = persona;
  const evidence = [group, ...only].join(' ');
  const file = path.join(root, 'data', 'runs', `${id}.json`);
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  r.outcome = { status: 'reached-payment', reason: 'Reached the payment step. Stopped there: nothing was paid.', reclassified: { from: r.outcome?.status, by: 'operator', why: evidence } };
  fs.writeFileSync(file, JSON.stringify(r));
  console.log(`${id} -> reached-payment`);
} else {
  console.log('usage: start <persona> <platforms|retailers> [label ...] | status | record');
}
