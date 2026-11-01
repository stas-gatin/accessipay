// Every number the brand site states comes from a recorded run. Run ids link to the replay.
// Do not add a number here that no run produced.

export const RUNS = {
  agentBlocked: '20261030-c2dca6', // AI agent, Pay button is a <div>, gave up after 21 steps (metrics), axe 0 on the shop's own code
  agentFixed: '20261030-2514af', // same agent after the AI fix (the <div> became a <button>), paid in 19 steps
  agentClean: '20261030-db2191', // agentic buyer task, Rain Jacket + express, $94.00
  keyboardBlocked: '20261030-cea700', // keyboard, focus-trapping popup, blocked on the cart, gave up after 14 steps (metrics), axe 0 on the shop's own code
  keyboardFixed: '20261030-0e4e77', // keyboard after the AI fix (7 changes), paid in 49 steps
  screenReader: '20261030-d7eaff', // screen reader, clean shop, paid in 36 steps through PayPal Card Fields
  // Friction: 24 category links before the content and no skip link. Paid either way; the fix is one skip link.
  frictionBefore: ['20261030-ca91a3', '20261030-9bcad1'],
  frictionAfter: ['20261030-55d6a8', '20261030-0c895e'],
};

// The owner report for the keyboard case: fix list, ready code, annotated screenshot and PDF.
export const REPORT_HREF = `#/report/case/${RUNS.keyboardBlocked}`;

// Step counts are the run metrics' `steps` (/api/runs/<id>/metrics): decisions, not counting the final give_up/done.
// Blocked runs: the customer gave up after this many steps.
export const GAVE_UP = { agent: 21, keyboard: 14 };
// The same blocked case run again (metrics steps): keyboard cea700, 003839, 39c539; agent ee0cff, 302c0f, c2dca6.
export const REPEATS = { keyboard: [14, 17, 19], agent: [19, 20, 21] };

// Paid runs. PayPal order ids stay in the run records and the owner report, not in the site copy.
export const ORDERS = {
  agentFixed: { amount: 54, steps: 19, patches: 5 },
  keyboardFixed: { amount: 54, steps: 49, patches: 7 },
  agentic: { amount: 94, item: 'Rain Jacket', delivery: 'express', steps: 18 },
  screenReader: { amount: 54, steps: 36 },
};

// Non-breaking spaces so the date never splits across lines.
// A customer name inside a sentence: lower case, but "AI" stays as it is.
export const lower = (s) => String(s).toLowerCase().replace(/\bai\b/g, 'AI');

export const EAA_DATE = 'June\u00a028,\u00a02025';

// The demo shop's defects (server/shop/defects.mjs) and how many of them axe-core (default rules) flags,
// each defect switched on alone, measured with spike/axe-per-defect.mjs on 2026-10-31.
export const DEMO_DEFECTS = 13;
export const AXE_FLAGGED = 2;
export const HOLDOUT_DEFECTS = 7;

// The patch the AI fixer returned for the long-menu shop (fix e23bb10e), applied to every page.
export const SKIP_FIX = {
  before: '<header class="top">',
  after: '<a class="skip" href="#main">Skip to main content</a><header class="top">',
};

// The key line of the fix the AI fixer returned for the blocked agent run (fix 46bd1fae, patch 1 of 5;
// the other four only add group names around the card fields).
export const PAY_FIX = {
  before: '<p><div class="btn primary" id="pay-button">Pay $54.00</div></p>',
  after: '<p><button type="submit" class="btn primary" id="pay-button">Pay $54.00</button></p>',
  why: 'Native submit button gives role, name, focusability and Enter-key implicit submission.',
};

export const CUSTOMERS = [
  {
    key: 'screenreader',
    name: 'Screen reader customer',
    standsFor: 'People who are blind or have low vision and use NVDA, JAWS or VoiceOver.',
    perceives: 'The accessibility tree of the page and where keyboard focus is. No pixels.',
    acts: 'Tab, Shift+Tab, Enter, Space, arrow keys, and an elements list that jumps to a control.',
    canClaim: 'Whether a customer who only has the accessibility tree and the keyboard could finish.',
    cannotClaim: 'The behavior of one specific screen reader, live announcements, or how long a person would take. A person would likely need more steps.',
    line: 'Hears the accessibility tree, moves with the keyboard.',
    proof: [
      { paid: true, run: RUNS.screenReader, text: `Bought on the clean shop in ${ORDERS.screenReader.steps} steps, card fields included; PayPal confirmed the order` },
    ],
    img: '01-screen-reader.png', art: 'screenreader', alt: 'Headphones resting on a braille display beside a laptop.',
  },
  {
    key: 'keyboard',
    name: 'Keyboard-only customer',
    standsFor: 'People with motor disabilities, tremor or RSI, someone with a broken trackpad or a temporary injury, and power users who live on the keyboard.',
    perceives: 'The visible text of the page and which element has focus.',
    acts: 'Only the keyboard: Tab, Shift+Tab, Enter, Space, Escape, arrow keys, typing.',
    canClaim: 'Whether every step of the checkout can be done without a mouse.',
    cannotClaim: 'Whether the focus outline is visible: the model is told where focus is even when a person could not see it.',
    line: 'No mouse: Tab, Enter, Escape and typing only.',
    proof: [
      { paid: false, run: RUNS.keyboardBlocked, text: `A popup trapped the keyboard on the cart page; the customer gave up after ${GAVE_UP.keyboard} steps` },
      { paid: true, run: RUNS.keyboardFixed, text: `After the AI fix (${ORDERS.keyboardFixed.patches} changes), bought in ${ORDERS.keyboardFixed.steps} steps; PayPal confirmed the order` },
    ],
    img: '02-keyboard.png', art: 'keyboard', alt: 'Blank keyboard keys, with the Tab key outlined in green light.',
  },
  {
    key: 'agent',
    name: 'AI shopping agent',
    standsFor: 'Agents that shop on a person’s behalf and act on elements by role and name, the way many browser agents do.',
    perceives: 'The accessibility tree, like a screen reader.',
    acts: 'Click, fill, select and check elements by role and exact accessible name.',
    canClaim: 'Whether an agent that reads the accessibility tree could complete the checkout.',
    cannotClaim: 'Agents that work from screenshots and coordinates, or any particular agent product.',
    line: 'Shops for a person, acting on controls by role and name.',
    proof: [
      { paid: false, run: RUNS.agentBlocked, text: `The Pay button wasn’t a real button; the agent gave up after ${GAVE_UP.agent} steps` },
      { paid: true, run: RUNS.agentFixed, text: `After the AI fix (${ORDERS.agentFixed.patches} changes), bought in ${ORDERS.agentFixed.steps} steps; PayPal confirmed the order` },
    ],
    img: '03-ai-agents.png', art: 'agents', alt: 'A glass shopping bag holding a green coin, with paths leading into it.',
  },
];

// The nine stages in the order a test runs them. MethodStrip (home page) reads n, title and short.
export const METHOD = [
  { n: 1, title: 'Analyze the shop', short: 'Find what it sells and where checkout starts.', detail: 'The customer starts on the shop’s home page with a goal in plain language, for example “Buy one Trail Backpack with standard delivery, no newsletters”.', artifact: { kind: 'quote', text: 'Gear for the trail · Trail Backpack $49.00 · Steel Water Bottle $18.00 · Rain Jacket $79.00' }, run: RUNS.agentBlocked },
  { n: 2, title: 'Break the goal into tasks', short: 'Find item, cart, details, delivery, pay.', detail: 'The purchase is split into checkout stages: Browse, Cart, Checkout, Payment, Paid. Each run is placed on that line, so every stop has a stage.', artifact: { kind: 'rail', stages: ['Browse', 'Cart', 'Checkout', 'Payment', 'Paid'], stop: 3 }, run: RUNS.agentBlocked },
  { n: 3, title: 'Send each customer type', short: 'Screen reader, keyboard-only, AI agent.', detail: 'Three simulated customers, each with its own way of perceiving the page and acting on it. Each one gets the same task, so one page can pass for one customer and block another.', artifact: { kind: 'list', items: ['Screen reader customer', 'Keyboard-only customer', 'AI shopping agent'] }, run: RUNS.screenReader },
  { n: 4, title: 'Can they finish?', short: 'Pass only when PayPal confirms the order.', detail: 'In the demo shop, a run passes only when PayPal (Orders v2, sandbox) reports the order as COMPLETED and the right item was bought. The customer saying “done” does not count. On real shops nobody pays: the customer stops at the payment step.', artifact: { kind: 'receipt' }, run: RUNS.agentFixed },
  { n: 5, title: 'Scan the rules', short: 'Run axe-core on every page of the flow.', detail: `The same pages the customer saw are scanned with axe-core, default rules (WCAG A/AA and best practices). On this defect, a Pay button that isn’t a real button, it found nothing. Across all ${DEMO_DEFECTS} demo defects, it flags ${AXE_FLAGGED}.`, artifact: { kind: 'stat', value: '0 violations', label: 'axe-core on the 4 pages of the shop’s own code, on this defect' }, run: RUNS.agentBlocked },
  { n: 6, title: 'Find the customer’s problem', short: 'The exact step where the customer stopped.', detail: 'Every step is recorded: what the customer perceived, what it decided and what happened. A stop is traced to the page and the element.', artifact: { kind: 'quote', text: `After ${GAVE_UP.agent} steps, the agent gives up · “All card fields are filled but there is no pay button in the tree, so I cannot submit the order.”` }, run: RUNS.agentBlocked },
  { n: 7, title: 'Fix the page', short: 'AI writes small changes for the blocker.', detail: 'The fixer reads the exact HTML of the page where the customer stopped, plus what the customer did, and returns small find-and-replace changes. Each one must match the page exactly once. Then the same customer tries again.', artifact: { kind: 'diff' }, run: RUNS.agentFixed },
  { n: 8, title: 'Effort before and after', short: 'Steps and inputs, not stopwatch time.', detail: 'We count steps and inputs, never run time, because most of a run’s clock time is the model thinking. Blocked to paid is “impossible to possible”, not “faster”.', artifact: { kind: 'stat', value: `Blocked after ${GAVE_UP.agent} steps → paid in ${ORDERS.agentFixed.steps} steps`, label: `AI shopping agent: blocked after ${GAVE_UP.agent} steps; after the AI fix (${ORDERS.agentFixed.patches} changes), PayPal confirmed its order in ${ORDERS.agentFixed.steps} steps` }, run: RUNS.agentFixed },
  { n: 9, title: 'Hand the owner the result', short: 'Fix list, ready code, screenshot, PDF.', detail: 'The owner gets the list of fixes ranked by who they block, the code ready to apply, a screenshot with the problem circled, and the same content as an accessible PDF (tagged, with an outline).', artifact: { kind: 'list', items: ['List of fixes', 'Ready code', 'Annotated screenshot', 'PDF report'] }, run: RUNS.keyboardBlocked },
];
