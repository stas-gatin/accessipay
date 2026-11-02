// Brain backed by an NVIDIA Nemotron model through the NVIDIA API (OpenAI-compatible chat completions).
// Same prompts and the same per-step message as the Claude brain: the persona prompt, the goal, a short
// log of recent actions and the current observation. Each step is one independent request.

import { systemPrompt, parseDecision } from '../prompts.mjs';
import { FIXER_SYSTEM, parseFix } from '../../fixer/fixer.mjs';

const BASE = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
// Nemotron 3.5 Super: in our test runs it paid as all three customers on the clean demo shop.
export const DEFAULT_MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';

// Reasoning models may think aloud before answering; the decision is the JSON after the thinking.
export function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// One chat completion, retried on rate limits and server errors.
async function chat({ apiKey, fetchImpl, body }) {
  if (!apiKey) throw new Error('NVIDIA API: set NVIDIA_API_KEY.');
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetchImpl(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 3000 * (attempt + 1))); continue; }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) throw new Error('NVIDIA API: no valid credentials (set NVIDIA_API_KEY).');
    if (!r.ok) throw new Error(`NVIDIA API ${r.status}: ${j.detail || j.error?.message || 'request failed'}`);
    return j;
  }
  throw new Error('NVIDIA API: rate limited, gave up after 4 tries.');
}

export function nvidiaBrain({
  model = process.env.NVIDIA_MODEL || DEFAULT_MODEL,
  apiKey = process.env.NVIDIA_API_KEY,
  recent = 12,
  fetchImpl = fetch,
} = {}) {
  const log = [];
  const usage = { requests: 0, input: 0, output: 0, costUsd: 0 };

  return {
    kind: 'nvidia',
    model,
    usage,
    async decide(ctx) {
      if (log.length && ctx.lastResult) log.at(-1).result = ctx.lastResult;
      const history = log.slice(-recent).map((h) => `${h.step}. ${h.action} ${JSON.stringify(h.args || {})} -> ${h.result || ''}`).join('\n');
      const content = [
        `Goal: ${ctx.goal}`,
        '',
        history ? `Your recent actions and what happened:\n${history}` : 'This is your first step on this site.',
        '',
        `Step ${ctx.step} of at most ${ctx.maxSteps}.`,
        '',
        ctx.observation,
      ].join('\n');
      const j = await chat({ apiKey, fetchImpl, body: {
        model,
        messages: [{ role: 'system', content: systemPrompt(ctx.persona) }, { role: 'user', content }],
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: 4096,
      } });
      usage.requests += 1;
      usage.input += j.usage?.prompt_tokens || 0;
      usage.output += j.usage?.completion_tokens || 0;
      const msg = j.choices?.[0]?.message || {};
      const d = parseDecision(stripThinking(msg.content || ''));
      log.push({ step: ctx.step, action: d.action, args: d.args });
      return d;
    },
  };
}

// The AI fixer on Nemotron: the same instructions and request as the Claude fixer.
export function nvidiaFixer({
  model = process.env.NVIDIA_FIX_MODEL || process.env.NVIDIA_MODEL || DEFAULT_MODEL,
  apiKey = process.env.NVIDIA_API_KEY,
  fetchImpl = fetch,
} = {}) {
  return {
    kind: 'nvidia',
    model,
    async propose(prompt) {
      const j = await chat({ apiKey, fetchImpl, body: {
        model,
        messages: [{ role: 'system', content: FIXER_SYSTEM }, { role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 8192,
      } });
      return { ...parseFix(stripThinking(j.choices?.[0]?.message?.content || '')), usage: j.usage };
    },
  };
}
