// Command line seat for an external brain (a Claude Code agent or a person).
//   node tools/agent.mjs start <persona> [defect,defect]   -> prints the run id
//   node tools/agent.mjs turn <runId>                      -> instructions (first time) and what you perceive now
//   node tools/agent.mjs decide <runId> '<json decision>'  -> submits, then prints the next turn
//   node tools/agent.mjs fix <runId> [page|*]              -> opens a fix job, prints its id, instructions and prompt
//   node tools/agent.mjs fix-reply <fixId> <file.json>     -> submits the fixer reply stored in a file
// Env: ACCESSIPAY_URL (default http://127.0.0.1:4300)
const BASE = process.env.ACCESSIPAY_URL || 'http://127.0.0.1:4300';
const [cmd, a, b] = process.argv.slice(2);

async function api(path, body) {
  const r = await fetch(BASE + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  return r.json();
}

async function printTurn(id, withInstructions) {
  for (;;) {
    const t = await api(`/api/runs/${id}/turn`);
    if (t.error) { console.log(t.error); return; }
    if (t.finished) { console.log(`RUN FINISHED: ${t.outcome?.status} - ${t.outcome?.reason}`); return; }
    if (t.waiting) continue;
    if (withInstructions) console.log(`=== INSTRUCTIONS ===\n${t.system}\n=== TURN ===`);
    console.log(t.message);
    return;
  }
}

if (cmd === 'start') {
  const r = await api('/api/runs', { persona: a || 'screenreader', brain: 'external', defects: b ? b.split(',') : [] });
  console.log(r.error || r.id);
} else if (cmd === 'turn') {
  await printTurn(a, true);
} else if (cmd === 'decide') {
  const r = await api(`/api/runs/${a}/decision`, { text: b });
  if (!r.ok) { console.log(`Not accepted: ${r.error}`); process.exit(1); }
  await printTurn(a, false);
} else if (cmd === 'fix') {
  const j = await api('/api/fixes', { runId: a, fixer: 'external', page: b });
  if (j.error) { console.log(j.error); process.exit(1); }
  const full = await api(`/api/fixes/${j.id}?full=1`);
  console.log(`FIX ID: ${j.id}\n=== INSTRUCTIONS ===\n${full.system}\n=== REQUEST ===\n${full.prompt}`);
} else if (cmd === 'fix-reply') {
  const { readFileSync } = await import('node:fs');
  const r = await api(`/api/fixes/${a}/reply`, { text: readFileSync(b, 'utf8') });
  if (r.error) { console.log(`Not applied: ${r.error}`); if (r.job?.rejected) console.log(JSON.stringify(r.job.rejected, null, 2)); process.exit(1); }
  console.log(`Applied ${r.accepted.length} patch(es), rejected ${r.rejected.length}.`);
  r.rejected.forEach((p) => console.log(`  rejected (${p.reason}): ${String(p.find).slice(0, 80)}`));
  console.log(r.diff);
} else {
  console.log('usage: start <persona> [defects] | turn <runId> | decide <runId> <json> | fix <runId> | fix-reply <fixId> <file>');
}
