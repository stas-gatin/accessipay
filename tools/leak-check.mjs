// Checks every published record of a withheld shop for the names, domains and brand words of all
// listed retailers (data/private/sites.json). Ordinary English words that happen to be a brand
// ("target", "away") are only checked against the shop they belong to.
//   node tools/leak-check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sites = JSON.parse(fs.readFileSync(path.join(root, 'data', 'private', 'sites.json'), 'utf8')).retailers;
let dict = new Set();
try { dict = new Set(fs.readFileSync('/usr/share/dict/words', 'utf8').split('\n').filter((w) => /^[a-z]/.test(w))); } catch {}
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const terms = sites.flatMap((r) => {
  const host = new URL(r.url).hostname.replace(/^www\./, '');
  return [host, host.split('.')[0], ...String(r.brand || '').split(',')].map((t) => t.trim()).filter((t) => t.length >= 4)
    .map((t) => ({ label: r.label, term: t, common: t.split(/\s+/).every((w) => dict.has(w.toLowerCase())) }));
});
const dir = path.join(root, 'data', 'recorded');
let hits = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  const run = JSON.parse(text);
  if (!run.site?.anonymized) continue;
  const values = JSON.stringify(run, (k, v) => v).replace(/"\w+":/g, ' ');
  for (const t of terms) {
    if (t.common && t.label !== run.site.host) continue;
    const m = values.match(new RegExp(`\\b${esc(t.term)}\\b`, 'i'));
    if (m) { hits++; console.log(`${f} (${run.site.host}): "${t.term}" of ${t.label}: …${values.slice(Math.max(0, m.index - 60), m.index + 60)}…`); }
  }
}
console.log(hits ? `${hits} possible leaks` : 'no leaks found');
process.exit(hits ? 1 : 0);
