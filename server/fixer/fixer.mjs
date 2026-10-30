// The fixer: given a blocked run, it reads the exact HTML of the page where the shopper got stuck
// and returns minimal text patches. Patches are validated (each `find` must occur exactly once),
// applied to the shop instance, and shown as a unified diff. A re-run then proves or disproves the fix.

import crypto from 'node:crypto';
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

// Validates patches against the current page HTML and applies the valid ones in order.
export function applyPatches({ shop, inst, page, base, patches }) {
  const before = shop.render(inst, page, base);
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
  const after = shop.render(inst, page, base);
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
export function createFixes({ shop, runs, origin, fixers = {} }) {
  const jobs = new Map();

  function start({ runId, fixer = 'external' }) {
    const run = runs.get(runId);
    if (!run) throw new Error('Run not found');
    if (run.status !== 'finished') throw new Error('The run is still going');
    const inst = shop.get(run.instanceId);
    if (!inst) throw new Error('The shop instance of this run has expired');
    const page = stuckPage(run);
    const base = `/s/${inst.id}`;
    const html = shop.render(inst, page, base);
    const id = crypto.randomBytes(4).toString('hex');
    const job = { id, runId, instanceId: inst.id, page, fixer, status: 'waiting', createdAt: new Date().toISOString(), system: FIXER_SYSTEM, prompt: fixPrompt({ run, page, html }) };
    jobs.set(id, job);
    if (fixers[fixer]) {
      job.status = 'working';
      fixers[fixer]().propose(job.prompt)
        .then((r) => finish(job, r))
        .catch((e) => { job.status = 'error'; job.error = e.message; });
    } else if (fixer !== 'external') {
      throw new Error(`Unknown fixer "${fixer}"`);
    }
    return job;
  }

  function finish(job, reply) {
    const inst = shop.get(job.instanceId);
    if (!inst) { job.status = 'error'; job.error = 'Shop instance expired'; return job; }
    if (reply.error && !reply.patches?.length) { job.status = 'error'; job.error = reply.error; return job; }
    const r = applyPatches({ shop, inst, page: job.page, base: `/s/${inst.id}`, patches: reply.patches || [] });
    Object.assign(job, { status: 'applied', summary: reply.summary, accepted: r.accepted, rejected: r.rejected, diff: r.diff, changed: r.changed, finishedAt: new Date().toISOString() });
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
