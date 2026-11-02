// Brain backed by an NVIDIA Nemotron model through the NVIDIA API (OpenAI-compatible chat completions).
// Same prompts and the same per-step message as the Claude brain: the persona prompt, the goal, a short
// log of recent actions and the current observation. Each step is one independent request.

import { systemPrompt, parseDecision } from '../prompts.mjs';

const BASE = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

// Reasoning models may think aloud before answering; the decision is the JSON after the thinking.
export function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export function nvidiaBrain({
  model = process.env.NVIDIA_MODEL || 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  apiKey = process.env.NVIDIA_API_KEY,
  recent = 12,
  fetchImpl = fetch,
} = {}) {
  const log = [];
  const usage = { requests: 0, input: 0, output: 0, costUsd: 0 };

  async function call(body) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetchImpl(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 3000 * (attempt + 1))); continue; }
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) throw new Error('NVIDIA API: no valid credentials (set NVIDIA_API_KEY).');
      if (!r.ok) throw new Error(`NVIDIA API ${r.status}: ${j.detail || j.error?.message || JSON.stringify(j).slice(0, 200)}`);
      return j;
    }
    throw new Error('NVIDIA API: rate limited, gave up after 4 tries.');
  }

  return {
    kind: 'nvidia',
    model,
    usage,
    async decide(ctx) {
      if (!apiKey) throw new Error('NVIDIA API: set NVIDIA_API_KEY.');
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
      const j = await call({
        model,
        messages: [{ role: 'system', content: systemPrompt(ctx.persona) }, { role: 'user', content }],
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: 4096,
      });
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
