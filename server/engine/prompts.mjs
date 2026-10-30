// Instructions shared by every brain (API model, Claude Code agent, or a person at the CLI),
// so a run means the same thing whoever is deciding.

import { PERSONAS } from './session.mjs';

// Agentic commerce: the customer states a need, the agent picks the product and buys it.
export const AGENTIC_GOAL = [
  'You are shopping on behalf of a customer who asked:',
  '"Get me something that keeps me dry on hikes, under $100, and I need it fast."',
  'Pick the one product that fits and the delivery that fits, then buy it.',
  'Customer details: full name Alex Morgan, email alex.morgan@example.com, street address 100 Example Avenue,',
  'city Testville, ZIP 99999, country United States.',
  'Pay by card: name on card Alex Morgan, card number 4111 1111 1111 1111, expiry 12/30, security code 123.',
  'Agree to the terms of sale. The customer does not want newsletters or promotions.',
].join(' ');

// Real sites: go as far as the payment step and stop there. Nothing is paid or ordered.
export const EXTERNAL_GOAL = [
  'This is a real online shop. Add any one in-stock product to the cart and go through checkout as far as the payment step, then stop.',
  'Never pay, never place or submit an order, never create an account or sign in, never type card details.',
  'If the shop asks for contact or shipping details before payment, use: full name Alex Morgan, email alex.morgan@example.com,',
  'street address 100 Example Avenue, city New York, state New York, ZIP 10001, country United States (or the closest option the shop offers), phone (212) 555-0142.',
  'Decline cookie banners, newsletters and promotions. When you see the payment form or a button that would pay or place the order,',
  'finish with done and your findings. If you cannot get that far, give up with honest findings.',
].join(' ');

export const GOALS = {
  checkout: { label: 'Buy a known item', text: undefined, expect: { sku: 'bp-01', delivery: 'standard' } },
  agentic: { label: 'Agentic buyer: find what the customer needs', text: AGENTIC_GOAL, expect: { sku: 'rj-03', delivery: 'express' } },
};

export const DEFAULT_GOAL = [
  'Buy one Trail Backpack with standard delivery.',
  'Your details: full name Alex Morgan, email alex.morgan@example.com, street address 100 Example Avenue,',
  'city Testville, ZIP 99999, country United States.',
  'Pay by card: name on card Alex Morgan, card number 4111 1111 1111 1111, expiry 12/30, security code 123.',
  'Agree to the terms of sale. You do not want newsletters or promotions.',
].join(' ');

const ACTIONS = {
  next: 'next: press Tab, focus moves to the next element. args: {}',
  prev: 'prev: press Shift+Tab, focus moves to the previous element. args: {}',
  jump: 'jump: use the screen reader elements list to move focus straight to a control by its role and exact name from the tree. Works only for controls that can take keyboard focus. args: {"role": "link", "name": "...", "nth": 0}',
  activate: 'activate: press Enter on the focused element. args: {}',
  press: 'press: press one key. args: {"key": one of Enter, Space, Escape, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Home, End, Backspace}',
  type: 'type: replace the text of the focused text field. args: {"text": "..."}',
  read: 'read: read the page again without doing anything. args: {}',
  click: 'click: click an element by its role and exact accessible name from the tree. args: {"role": "button", "name": "...", "nth": 0}',
  fill: 'fill: type into a field by role and exact accessible name. args: {"role": "textbox", "name": "...", "text": "..."}',
  select: 'select: choose an option in a combobox by its name. args: {"name": "...", "option": "..."}',
  check: 'check: tick a checkbox or radio by its name. args: {"role": "checkbox" or "radio", "name": "..."}',
  done: 'done: the purchase is complete and the page confirms it. args: {}',
  give_up: 'give_up: you cannot finish. args: {}',
};

export function systemPrompt(persona) {
  const p = PERSONAS[persona];
  const how = {
    screenreader: 'You cannot see the screen. You only hear the page as an accessibility tree, the way a screen reader presents it, and you can only use the keyboard. You do not know anything about the page that is not in the tree.',
    keyboard: 'You can see the page text on screen but you cannot use a mouse or touchpad. You can only use the keyboard.',
    agent: 'You are an AI shopping agent. You read the page as an accessibility tree and act on elements by their role and exact accessible name. Elements that are not in the tree with a role and a name cannot be targeted.',
  }[persona];
  return [
    `You are testing an online shop as a real customer: ${p.label}. ${how}`,
    'Work toward the goal step by step. Each turn you get what you perceive now and the result of your last action. Choose exactly one action per turn.',
    'Act like a real customer: do not guess hidden page internals, do not invent elements that are not there, and do not claim success unless the page confirms the order.',
    'If you are stuck after trying reasonable options, give up honestly. Never pretend the purchase worked.',
    '',
    'Available actions:',
    ...p.actions.map((a) => `- ${ACTIONS[a]}`),
    '',
    'Reply with one JSON object only, no other text:',
    '{"thought": "one short sentence on why", "action": "...", "args": {...}}',
    'When you choose "done" or "give_up", also add "findings": a list of every accessibility problem you met, each {"page": "page title", "problem": "what blocked or confused you, in plain words", "step": step number where you met it, "element": {"role": "...", "name": "..."} if it is about one element}. Use an empty list if there were none.',
  ].join('\n');
}

export function turnMessage({ goal, observation, lastResult, step, maxSteps }) {
  return [
    step === 1 ? `Goal: ${goal}\n` : '',
    lastResult ? `Result of your last action: ${lastResult}\n` : '',
    `Step ${step} of at most ${maxSteps}.`,
    '',
    observation,
  ].join('\n').trim();
}

// Accepts the brain's text and returns a decision, tolerating code fences or extra prose.
export function parseDecision(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return { action: 'read', args: {}, thought: 'Could not parse a decision.', parseError: raw.slice(0, 200) };
  try {
    const d = JSON.parse(raw.slice(start, end + 1));
    return { action: String(d.action || 'read'), args: d.args || {}, thought: String(d.thought || ''), findings: Array.isArray(d.findings) ? d.findings : undefined };
  } catch {
    return { action: 'read', args: {}, thought: 'Could not parse a decision.', parseError: raw.slice(0, 200) };
  }
}
