// The fixer: given a blocked run, it reads the exact HTML of the page where the shopper got stuck
// and returns minimal text patches. Patches are validated (each `find` must occur exactly once),
// applied to the shop instance, and shown as a unified diff. A re-run then proves or disproves the fix.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createTwoFilesPatch } from 'diff';
import Anthropic from '@anthropic-ai/sdk';
import { PAGE_PATHS } from '../shop/instances.mjs';
import { PERSONAS } from '../engine/session.mjs';

const PATH_TO_PAGE = Object.fromEntries(Object.entries(PAGE_PATHS).map(([k, v]) => [v, k]));

export const FIXER_SYSTEM = [
  'You are an accessibility engineer fixing a checkout page so that real customers who use a screen reader, only a keyboard, or an AI shopping agent can complete a purchase.',
  'You get the exact HTML the browser received, and a transcript of a customer who got stuck on it.',
  'Fix the root cause with the smallest change that follows WAI-ARIA and WCAG practice: native elements over ARIA, correct names and labels, keyboard operability, focus management, status messages that are announced.',
  'Keep the visual design and keep every existing feature working. Do not remove the promotion, the fields, or any step of the flow.',
  'Reply with one JSON object only:',
  '{"summary": "one or two sentences in plain words", "patches": [{"find": "exact text copied from the HTML", "replace": "new text", "why": "short reason"}]}',
  'Each "find" must be copied exactly from the HTML and must occur exactly once in it; include enough surrounding text to make it unique. Prefer several small patches over one large one.',
].join('\n');

export function stuckPage(run) {
  const observes = run.events.filter((e) => e.type === 'observe' || e.type === 'end');
  const last = observes.at(-1);
  return PATH_TO_PAGE[last?.path || '/'] || 'catalog';
}

export function fixPrompt({ run, page, html }) {
  const steps = [];
  for (const e of run.events) {
    if (e.type === 'decide') steps.push(`${e.step}. ${e.action} ${JSON.stringify(e.args || {})}${e.thought ? ` (thinking: ${e.thought})` : ''}`);
    if (e.type === 'act') steps.push(`   -> ${e.result}`);
  }
  const findings = (run.findings || []).map((f) => `- ${f.page}: ${f.problem}`).join('\n') || '- (none reported)';
  const end = run.events.find((e) => e.type === 'end');
  return [
    `Customer: ${PERSONAS[run.persona].label}. ${PERSONAS[run.persona].summary}`,
    `Outcome: ${run.outcome?.status} - ${run.outcome?.reason}`,
    '',
    `What the customer reported:\n${findings}`,
    '',
    `Last steps of the customer (most recent last):\n${steps.slice(-40).join('\n')}`,
    '',
    `What the customer perceived at the end:\n${(end?.text || '').slice(0, 4000)}`,
    '',
    `The page to fix is "${page}". Its exact HTML:\n<html_source>\n${html}\n</html_source>`,
  ].join('\n');
}

export function parseFix(text) {
  const raw = String(text || '');
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s < 0 || e <= s) return { summary: '', patches: [], error: 'No JSON object in the reply.' };
  try {
    const j = JSON.parse(raw.slice(s, e + 1));
    return { summary: String(j.summary || ''), patches: Array.isArray(j.patches) ? j.patches : [] };
  } catch (err) {
    return { summary: '', patches: [], error: `Invalid JSON: ${err.message}` };
  }
}

// Which patches would apply to this HTML, in order, without changing anything.
export function checkPatches(html, patches) {
  const rejected = [];
  let ok = 0;
  for (const p of patches || []) {
    const find = String(p.find ?? '');
    const count = find ? html.split(find).length - 1 : 0;
    if (count !== 1) { rejected.push({ ...p, reason: count === 0 ? 'text not found' : `text occurs ${count} times` }); continue; }
    html = html.replace(find, () => String(p.replace ?? ''));
    ok += 1;
  }
  return { ok, rejected };
}

// The follow-up request when some patches did not match the HTML exactly.
export function retryPrompt(prompt, reply, rejected) {
  const lines = rejected.map((r) => `- ${r.reason}: ${JSON.stringify(String(r.find ?? '').slice(0, 300))}`);
  return [
    prompt,
    '',
    `Your previous reply:\n${JSON.stringify({ summary: reply.summary, patches: reply.patches })}`,
    '',
    `These "find" strings do not occur exactly once in the HTML above, so they could not be applied:\n${lines.join('\n')}`,
    'Copy each "find" character for character from <html_source>, with the same tags, attributes and whitespace, and add no wrapper element that is not there. Reply with the whole JSON object again.',
  ].join('\n');
}

// Lines of the page shown in the console while the fixer reads it.
function previewLines(html) {
  const body = html.slice(Math.max(0, html.search(/<body[\s>]/i)));
  return body.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()).slice(0, 160).map((l) => l.slice(0, 110));
}

// Validates patches against the current page HTML and applies the valid ones in order.
export function applyPatches({ shop, inst, page, base, patches }) {
  // '*' means the shared layout: validate against one page, apply everywhere.
  const view = page === '*' ? 'catalog' : page;
  const before = shop.render(inst, view, base);
  let html = before;
  const accepted = [];
  const rejected = [];
  for (const p of patches) {
    const find = String(p.find ?? '');
    const count = find ? html.split(find).length - 1 : 0;
    if (count !== 1) { rejected.push({ ...p, reason: count === 0 ? 'text not found' : `text occurs ${count} times` }); continue; }
    html = html.replace(find, () => String(p.replace ?? ''));
    accepted.push({ id: crypto.randomBytes(3).toString('hex'), page, find, replace: String(p.replace ?? ''), why: String(p.why || '') });
  }
  // Store as one patch per accepted edit, applied on top of what was already there.
  inst.patches.push(...accepted);
  shop.save(inst);
  const after = shop.render(inst, view, base);
  const diff = createTwoFilesPatch(`${page}.html (before)`, `${page}.html (after)`, before, after, '', '', { context: 2 });
  return { accepted, rejected, diff, changed: before !== after };
}

export function anthropicFixer({ model = process.env.ACCESSIPAY_FIX_MODEL || 'claude-opus-5-5', client = new Anthropic() } = {}) {
  return {
    kind: 'anthropic',
    model,
    async propose(prompt) {
      const res = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        system: FIXER_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
        output_config: { effort: 'high' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      if (res.stop_reason === 'refusal') return { summary: '', patches: [], error: 'The model declined.' };
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { ...parseFix(text), usage: res.usage };
    },
  };
}

// Keeps fix jobs; an external fixer (a Claude Code agent) reads the prompt and posts its reply.
export function createFixes({ shop, runs, origin, fixers = {}, dataDir }) {
  const jobs = new Map();
  const dirs = dataDir ? [path.join(dataDir, 'fixes'), path.join(dataDir, 'recorded', 'fixes')] : [];
  if (dirs[0]) fs.mkdirSync(dirs[0], { recursive: true });
  const persist = (job) => { if (dirs[0]) fs.writeFileSync(path.join(dirs[0], `${job.id}.json`), JSON.stringify(job, null, 2)); };
  // Fixes from earlier sessions and the recorded demo set.
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const job = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!jobs.has(job.id)) jobs.set(job.id, job);
    }
  }

  function start({ runId, fixer = 'external', page: pageOverride }) {
    const run = runs.get(runId);
    if (!run) throw new Error('Run not found');
    if (run.status !== 'finished') throw new Error('The run is still going');
    const inst = shop.get(run.instanceId);
    if (!inst) throw new Error('The shop instance of this run has expired');
    // A friction run is not stuck anywhere; the caller can name the page, or '*' for the shared layout.
    const page = ['catalog', 'cart', 'checkout', 'pay', 'done', '*'].includes(pageOverride) ? pageOverride : stuckPage(run);
    const base = `/s/${inst.id}`;
    const html = shop.render(inst, page === '*' ? 'catalog' : page, base);
    const id = crypto.randomBytes(4).toString('hex');
    const job = { id, runId, instanceId: inst.id, page, fixer, status: 'waiting', createdAt: new Date().toISOString(), system: FIXER_SYSTEM, prompt: fixPrompt({ run, page, html }), preview: previewLines(html), htmlLines: html.split('\n').length };
    jobs.set(id, job);
    persist(job);
    if (fixers[fixer]) {
      job.status = 'working';
      job.stage = 'writing';
      job.attempt = 1;
      autoFix(job, fixers[fixer](), html)
        .then((r) => finish(job, r))
        .catch((e) => { job.status = 'error'; job.error = e.message; persist(job); });
    } else if (fixer !== 'external') {
      throw new Error(`Unknown fixer "${fixer}"`);
    }
    return job;
  }

  // An AI fixer gets up to three tries: a reply whose patches do not match the page goes back with the reasons.
  async function autoFix(job, fixer, html, tries = 3) {
    let prompt = job.prompt;
    let reply;
    for (let attempt = 1; attempt <= tries; attempt++) {
      Object.assign(job, { stage: attempt === 1 ? 'writing' : 'retrying', attempt });
      reply = await fixer.propose(prompt);
      job.stage = 'checking';
      const { ok, rejected } = checkPatches(html, reply.patches);
      if (!rejected.length && ok) break;
      if (reply.error && !reply.patches?.length && attempt === tries) break;
      job.retries = [...(job.retries || []), { attempt, rejected: rejected.length, error: reply.error || undefined }];
      prompt = rejected.length ? retryPrompt(job.prompt, reply, rejected) : job.prompt;
    }
    job.stage = 'applying';
    return reply;
  }

  function finish(job, reply) {
    const inst = shop.get(job.instanceId);
    if (!inst) { job.status = 'error'; job.error = 'Shop instance expired'; return job; }
    if (reply.error && !reply.patches?.length) { job.status = 'error'; job.error = reply.error; return job; }
    const r = applyPatches({ shop, inst, page: job.page, base: `/s/${inst.id}`, patches: reply.patches || [] });
    Object.assign(job, { status: 'applied', stage: 'done', summary: reply.summary, accepted: r.accepted, rejected: r.rejected, diff: r.diff, changed: r.changed, finishedAt: new Date().toISOString() });
    persist(job);
    return job;
  }

  function submit(id, text) {
    const job = jobs.get(id);
    if (!job) return { ok: false, error: 'No such fix' };
    if (job.status !== 'waiting') return { ok: false, error: `Fix is ${job.status}` };
    finish(job, parseFix(text));
    return { ok: job.status === 'applied', job };
  }

  return { start, submit, get: (id) => jobs.get(id) || null, list: () => [...jobs.values()] };
}
