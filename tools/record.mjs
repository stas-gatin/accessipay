// Copies finished runs (record, screenshots) and the fixes made from them into data/recorded/,
// the set the console replays when nothing is running live. Recorded files are committed.
//   node tools/record.mjs <runId> [runId ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runsDir = path.join(root, 'data', 'runs');
const out = path.join(root, 'data', 'recorded');
fs.mkdirSync(path.join(out, 'fixes'), { recursive: true });
const fixes = fs.existsSync(path.join(root, 'data', 'fixes')) ? fs.readdirSync(path.join(root, 'data', 'fixes')).map((f) => JSON.parse(fs.readFileSync(path.join(root, 'data', 'fixes', f), 'utf8'))) : [];

for (const id of process.argv.slice(2)) {
  const file = path.join(runsDir, `${id}.json`);
  if (!fs.existsSync(file)) { console.log(`skip ${id}: no such finished run`); continue; }
  const run = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (run.status !== 'finished') { console.log(`skip ${id}: not finished`); continue; }
  fs.copyFileSync(file, path.join(out, `${id}.json`));
  fs.cpSync(path.join(runsDir, id), path.join(out, id), { recursive: true });
  for (const f of fixes.filter((x) => x.runId === id && x.status === 'applied')) {
    fs.writeFileSync(path.join(out, 'fixes', `${f.id}.json`), JSON.stringify(f, null, 2));
  }
  console.log(`recorded ${id}: ${run.persona}, ${run.outcome?.status}, ${fs.readdirSync(path.join(out, id)).length} screenshots`);
}
