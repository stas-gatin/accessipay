// Checks every finding on real sites against the record of its run (page snapshot, focus, axe-core)
// and prints how many were confirmed, per site and in total, plus the ones that were not.
//   node tools/verify-findings.mjs [--misses]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyFindings, verificationSummary } from '../server/verify.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'recorded');
const showMisses = process.argv.includes('--misses');
const all = [];
const bySite = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && /^\d{8}-/.test(x))) {
  const run = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (!run.site || !run.findings?.length) continue;
  const checks = verifyFindings(run);
  checks.forEach((c, i) => all.push({ ...c, site: run.site.host, persona: run.persona, run: run.id, finding: run.findings[i] }));
  const s = (bySite[run.site.host] ||= []);
  s.push(...checks);
}
for (const [site, checks] of Object.entries(bySite).sort()) {
  const v = verificationSummary(checks);
  console.log(`${site.padEnd(30)} ${String(v.total).padStart(3)} findings  confirmed ${v.confirmed}  axe only ${v.partly}  not confirmed ${v.notConfirmed}  manual ${v.manual}`);
}
const v = verificationSummary(all);
console.log(`\nTOTAL ${v.total} findings: ${v.confirmed} confirmed by the record, ${v.partly} by axe-core only, ${v.notConfirmed} not confirmed, ${v.manual} need a person (${v.checked} checkable automatically)`);
const kinds = {};
for (const c of all) { const k = (kinds[c.kind] ||= { n: 0, ok: 0 }); k.n++; if (c.status === 'confirmed') k.ok++; }
console.log('by kind:', Object.entries(kinds).map(([k, x]) => `${k} ${x.ok}/${x.n}`).join(', '));
if (showMisses) for (const c of all.filter((x) => x.status === 'not-confirmed')) console.log(`\nMISS ${c.site} ${c.persona} step ${c.finding.step} [${c.kind}] ${c.finding.problem.slice(0, 160)}`);
