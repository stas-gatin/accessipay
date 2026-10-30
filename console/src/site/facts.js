// Every number the brand site states comes from a recorded run. Run ids link to the replay.
// Do not add a number here that no run produced.

export const RUNS = {
  agentBlocked: '20261030-ee0cff', // AI agent, Pay button is a <div>, gave up after 20 steps, axe 0 violations
  agentFixed: '20261030-a29ad7', // same agent after the one-line fix, paid in 18 steps
  agentClean: '20261030-db2191', // agentic buyer task, Rain Jacket + express, $94.00
  keyboardBlocked: '20261030-003839', // keyboard, focus-trapping popup, blocked on the cart, axe 0 violations
  keyboardFixed: '20261030-750001', // keyboard after a 7-patch fix, paid in 46 steps
  screenReader: '20261030-a47d5d', // screen reader, clean shop, paid in 35 steps
  hydrogen: '20261030-82bb98',
  medusa: '20261030-ac71b0',
  saleor: '20261030-f7ff60',
};

// The owner report is being built by another engineer; until then, link to the run behind it.
export const REPORT_HREF = `#/runs/${RUNS.keyboardBlocked}`;

export const ORDERS = {
  agentFixed: { id: '0CS292858A5878721', amount: 54, steps: 18 },
  keyboardFixed: { id: '4EE29379NJ857474Y', amount: null, steps: 46, patches: 7 },
  agentic: { id: '6U503846E1796980G', amount: 94, item: 'Rain Jacket', delivery: 'express' },
  screenReader: { id: '46199855B31709308', steps: 35 },
};

export const EAA_DATE = '28 June 2025';

// The one-line fix the AI fixer returned for the blocked agent run (fix 7ab82852, patch c819e6).
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
    cannotClaim: 'The behaviour of one specific screen reader, live announcements, or how long a person would take. Its step counts are a lower bound.',
    proof: { run: RUNS.screenReader, text: 'Bought on the clean shop in 35 steps', order: ORDERS.screenReader.id },
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
    proof: { run: RUNS.keyboardFixed, text: 'Blocked by a focus-trapping popup, then bought after a 7-patch AI fix in 46 steps', order: ORDERS.keyboardFixed.id },
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
    proof: { run: RUNS.agentFixed, text: 'Blocked by a <div> Pay button, then bought after a one-line fix in 18 steps', order: ORDERS.agentFixed.id },
    img: '03-ai-agents.png', art: 'agents', alt: 'A glass shopping bag holding a green coin, with paths leading into it.',
  },
];

export const METHOD = [
  { n: 1, title: 'Analyse the shop', short: 'Find what it sells and where checkout starts.', detail: 'The customer starts on the shop’s home page with a goal in plain language, for example “Buy one Trail Backpack with standard delivery, no newsletters”.', artifact: { kind: 'quote', text: 'Gear for the trail · Trail Backpack $49.00 · Steel Water Bottle $18.00 · Rain Jacket $79.00' }, run: RUNS.agentBlocked },
  { n: 2, title: 'Scan the rules', short: 'Run axe-core on every page of the flow.', detail: 'The same pages the customer saw are scanned with axe-core, default rules (WCAG A/AA and best practices). On the demo shop with the <div> Pay button, it found nothing.', artifact: { kind: 'stat', value: '0 violations', label: 'axe-core on 4 pages, shop with the <div> Pay button' }, run: RUNS.agentBlocked },
  { n: 3, title: 'Find the customer’s problem', short: 'The exact step where the customer stopped.', detail: 'Every step is recorded: what the customer perceived, what it decided and what happened. A stop is located to the page and the element.', artifact: { kind: 'quote', text: 'Step 20 · “No pay button exists in the tree, so I cannot place the order and will not claim success.”' }, run: RUNS.agentBlocked },
  { n: 4, title: 'Break the goal into tasks', short: 'Find item, cart, details, delivery, pay.', detail: 'The purchase is split into checkout stages: Browse, Cart, Details, Payment, PayPal confirmed. Each run is placed on that rail, so a stop has a stage.', artifact: { kind: 'rail', stages: ['Browse', 'Cart', 'Details', 'Payment', 'PayPal confirmed'], stop: 3 }, run: RUNS.agentBlocked },
  { n: 5, title: 'Fix the page', short: 'AI writes the smallest patch for the blocker.', detail: 'The fixer reads the exact HTML of the page where the customer stopped plus the transcript, and returns minimal find-and-replace patches. Each must match the page exactly once.', artifact: { kind: 'diff' }, run: RUNS.agentFixed },
  { n: 6, title: 'Send each customer type', short: 'Screen reader, keyboard-only, AI agent.', detail: 'Three simulated customers, each with its own perception and actions. The same task is run by each, so one page can pass for one customer and block another.', artifact: { kind: 'list', items: ['Screen reader customer', 'Keyboard-only customer', 'AI shopping agent'] }, run: RUNS.screenReader },
  { n: 7, title: 'Can they finish?', short: 'Pass only when PayPal confirms the order.', detail: 'A run passes only when the PayPal Orders v2 API reports the sandbox order as COMPLETED and the right item was bought. Saying “done” does not count.', artifact: { kind: 'receipt' }, run: RUNS.agentFixed },
  { n: 8, title: 'Effort before and after', short: 'Steps and inputs, not stopwatch time.', detail: 'We count steps and inputs, never run time, because most of a run’s clock time is the model thinking. Blocked to paid is “impossible to possible”, not “faster”.', artifact: { kind: 'stat', value: '18 = 18', label: 'Agent after the one-line fix: 18 steps, the same as on the shop without the defect' }, run: RUNS.agentFixed },
  { n: 9, title: 'Hand the owner the result', short: 'Fix list, ready code, screenshot, PDF.', detail: 'The owner gets the list of fixes ranked by who they block, the code ready to apply, a screenshot with the problem circled, and the same content as a PDF (in progress).', artifact: { kind: 'list', items: ['List of fixes', 'Ready code', 'Annotated screenshot', 'PDF report (in progress)'] }, run: RUNS.keyboardBlocked },
];

export const REAL_SITES = [
  {
    platform: 'Shopify Hydrogen', host: 'hydrogen.shop', run: RUNS.hydrogen, image: 'step-007.jpg',
    reached: 'Reached the payment form in 7 steps.',
    finding: 'The card fields are iframes without accessible names, so the agent could not tell which field was which.',
    evidence: 'Variant options also do not say which one is selected.',
    axe: '24 issues on 4 pages',
    tone: 'finding',
  },
  {
    platform: 'Medusa', host: 'next.medusajs.com', run: RUNS.medusa, image: 'step-012.jpg',
    reached: 'Reached “Place order” in 28 steps.',
    finding: 'The checkout text fields and the country select have no accessible names, so the agent could only fill them by position.',
    evidence: 'The agent’s recorded action: fill textbox "" nth=2 with "12 Market Street".',
    axe: '52 issues on 6 pages. axe-core did flag these fields (rules label and select-name).',
    tone: 'finding',
  },
  {
    platform: 'Saleor', host: 'storefront.saleor.io', run: RUNS.saleor, image: 'step-020.jpg',
    reached: 'Stopped at payment after 28 steps: the demo has no payment gateway configured.',
    finding: 'That stop is a demo configuration, not an accessibility defect. On the way, form fields changed their names after the country loaded, so the agent’s first fill failed.',
    evidence: 'Optional fields are named twice, for example “Phone (optional)(optional)”.',
    axe: '49 issues on 5 pages',
    tone: 'config',
  },
];
