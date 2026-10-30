// Copies finished runs (record, screenshots) and the fixes made from them into data/recorded/,
// the set the console replays when nothing is running live. Recorded files are committed.
//   node tools/record.mjs <runId> [runId ...]
//   node tools/record.mjs --anon "Retailer A" --brand "Acme,Acme Co" <runId>   -> a real retailer, published
//     without its name: its host and brand words are replaced, and its screenshots are not kept (they show the brand).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runsDir = path.join(root, 'data', 'runs');
const out = path.join(root, 'data', 'recorded');
fs.mkdirSync(path.join(out, 'fixes'), { recursive: true });
const fixes = fs.existsSync(path.join(root, 'data', 'fixes')) ? fs.readdirSync(path.join(root, 'data', 'fixes')).map((f) => JSON.parse(fs.readFileSync(path.join(root, 'data', 'fixes', f), 'utf8'))) : [];

// Replaces the site's host (with or without www) and any brand words given, in every string value
// of a recorded run. Keys are left alone, so the record stays readable by the console.
export function anonymize(run, label, brands = []) {
  const host = run.site?.host;
  if (!host) return run;
  const bare = host.replace(/^www\./, '');
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fake = `${label.toLowerCase().replace(/\s+/g, '-')}.example`;
  const swap = (s) => brands.reduce(
    (acc, b) => acc.replace(new RegExp(`\\b${esc(b)}\\b`, 'gi'), label),
    s.replace(new RegExp(`(www\\.)?${esc(bare)}`, 'gi'), fake),
  );
  const walk = (v) => (typeof v === 'string' ? swap(v) : Array.isArray(v) ? v.map(walk)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  const out = walk(run);
  out.site = { url: null, host: label, anonymized: true };
  for (const e of out.events || []) delete e.image;
  return out;
}

const args = process.argv.slice(2);
let anon = null;
let brands = [];
const ids = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--anon') anon = args[++i];
  else if (args[i] === '--brand') brands = args[++i].split(',').map((b) => b.trim()).filter(Boolean);
  else ids.push(args[i]);
}

for (const id of ids) {
  const file = path.join(runsDir, `${id}.json`);
  if (!fs.existsSync(file)) { console.log(`skip ${id}: no such finished run`); continue; }
  const run = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (run.status !== 'finished') { console.log(`skip ${id}: not finished`); continue; }
  if (anon) {
    fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(anonymize(run, anon, brands)));
    console.log(`recorded ${id} as "${anon}" (anonymized, no screenshots): ${run.persona}, ${run.outcome?.status}`);
    continue;
  }
  fs.copyFileSync(file, path.join(out, `${id}.json`));
  fs.cpSync(path.join(runsDir, id), path.join(out, id), { recursive: true });
  for (const f of fixes.filter((x) => x.runId === id && x.status === 'applied')) {
    fs.writeFileSync(path.join(out, 'fixes', `${f.id}.json`), JSON.stringify(f, null, 2));
  }
  console.log(`recorded ${id}: ${run.persona}, ${run.outcome?.status}, ${fs.readdirSync(path.join(out, id)).length} screenshots`);
}
