// A fixed list of decisions, used by tests and by the non-AI baseline. No intelligence.
export function scriptedBrain(decisions) {
  let i = 0;
  return {
    kind: 'scripted',
    async decide() {
      if (i < decisions.length) return { thought: 'scripted step', args: {}, ...decisions[i++] };
      return { action: 'give_up', args: {}, thought: 'Script finished.', findings: [] };
    },
  };
}
