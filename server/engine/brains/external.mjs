// The decision comes from outside the server: a Claude Code agent or a person using
// tools/agent.mjs. The run waits for each decision and gives up after `timeoutMs`.
import { systemPrompt, turnMessage, parseDecision } from '../prompts.mjs';

export function externalBrain({ timeoutMs = 10 * 60 * 1000 } = {}) {
  let resolveDecision = null;
  let waiters = [];
  const brain = {
    kind: 'external',
    pending: null,
    async decide(ctx) {
      brain.pending = { step: ctx.step, system: systemPrompt(ctx.persona), message: turnMessage(ctx) };
      waiters.forEach((w) => w(brain.pending));
      waiters = [];
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          resolveDecision = null;
          brain.pending = null;
          resolve({ action: 'give_up', args: {}, thought: 'No decision arrived in time.', findings: [], timeout: true });
        }, timeoutMs);
        resolveDecision = (d) => { clearTimeout(timer); resolve(d); };
      });
    },
    // Resolves with the next pending turn (immediately if one is waiting).
    nextTurn() {
      if (brain.pending) return Promise.resolve(brain.pending);
      return new Promise((r) => waiters.push(r));
    },
    submit(text) {
      if (!resolveDecision) return { ok: false, error: 'No decision is pending.' };
      const d = typeof text === 'string' ? parseDecision(text) : parseDecision(JSON.stringify(text));
      const r = resolveDecision;
      resolveDecision = null;
      brain.pending = null;
      r(d);
      return { ok: true, decision: d };
    },
    close() { waiters.forEach((w) => w(null)); waiters = []; },
  };
  return brain;
}
