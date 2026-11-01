// Brain backed by the Claude API. Each step is one independent request: the frozen persona
// prompt (cached) plus a user message with the goal, a short log of recent actions and the
// current observation. No growing conversation, so every run step costs about the same.

import Anthropic from '@anthropic-ai/sdk';
import { systemPrompt, parseDecision } from '../prompts.mjs';

// $ per million tokens: input, output, cache read (first-party API rates)
export const PRICES = {
  'claude-opus-5-5': [4, 20, 0.2],
  'claude-sonnet-5-5': [2, 10, 0.2],
  'claude-haiku-5-5': [0.1, 0.5, 0.01],
};
const WITH_FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

export function anthropicBrain({
  model = process.env.ACCESSIPAY_MODEL || 'claude-opus-5-5',
  effort = process.env.ACCESSIPAY_EFFORT || 'medium',
  client = new Anthropic(),
  recent = 12,
} = {}) {
  const log = [];
  const usage = { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 };

  function account(u) {
    usage.requests += 1;
    usage.input += u.input_tokens || 0;
    usage.output += u.output_tokens || 0;
    usage.cacheRead += u.cache_read_input_tokens || 0;
    usage.cacheWrite += u.cache_creation_input_tokens || 0;
    const p = PRICES[model];
    if (p) {
      usage.costUsd = (usage.input * p[0] + usage.cacheWrite * p[0] * 1.25 + usage.cacheRead * p[2] + usage.output * p[1]) / 1e6;
    }
  }

  return {
    kind: 'anthropic',
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

      const params = {
        model,
        max_tokens: 8000,
        system: [{ type: 'text', text: systemPrompt(ctx.persona), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content }],
        output_config: { effort },
      };
      if (WITH_FALLBACK.has(model)) {
        params.betas = ['server-side-fallback-2026-07-01'];
        params.fallbacks = 'default';
      }

      let res;
      try {
        res = await client.beta.messages.create(params);
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) throw new Error('Claude API: no valid credentials (set ANTHROPIC_API_KEY).');
        if (e instanceof Anthropic.RateLimitError) {
          await new Promise((r) => setTimeout(r, 5000));
          res = await client.beta.messages.create(params);
        } else throw e;
      }
      account(res.usage || {});

      if (res.stop_reason === 'refusal') {
        return { action: 'give_up', args: {}, thought: `The model declined (${res.stop_details?.category || 'no category'}).`, findings: [] };
      }
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const d = parseDecision(text);
      log.push({ step: ctx.step, action: d.action, args: d.args });
      return d;
    },
  };
}
