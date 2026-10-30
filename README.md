# AccessiPay

**Zero violations. Zero purchases.** Accessibility scanners check rules. AccessiPay checks the outcome: it sends a shopper who cannot see the screen, a shopper who cannot use a mouse, or an AI shopping agent to buy through PayPal, and only a paid order counts as success. When the shopper gets stuck, AI patches the page and the same shopper tries again.

Built for the PayPal AI Hackathon 2026.

## Why

A checkout can pass an automated scan and still be impossible to complete. In the demo shop, axe-core (default rules, every page of the flow) flags 2 of 12 real checkout defects. The other 10 include a promo popup that traps the keyboard, a Pay button made of a `<div>`, and form errors hidden from assistive technology. Each of them can stop a purchase.

The same thing blocks AI shopping agents: they read pages through the accessibility tree, just like screen readers. A checkout a blind customer cannot finish is a checkout an agent cannot finish either.

## How it works

1. **Demo shop.** Five pages (catalog, cart, checkout, payment, confirmation) with twelve switchable defects (`server/shop/defects.mjs`), split into a train set and a holdout set.
2. **Shoppers.** Three personas, each with its own perception and actions (`server/engine/session.mjs`):
   - *Screen reader user*: gets only the accessibility tree; moves with Tab, Shift+Tab, Enter, Space, arrows, and a screen reader elements list that can jump to focusable controls.
   - *Keyboard-only user*: sees the visible page text; uses only the keyboard.
   - *AI shopping agent*: reads the accessibility tree and acts on elements by role and exact name.
3. **Brain.** Each step is decided by Claude (Claude API), by a Claude Code agent through `tools/agent.mjs`, or by a fixed script in tests.
4. **Oracle.** A run succeeds only when PayPal reports the order as `COMPLETED` (Orders v2). Saying "done" is not enough.
5. **Scanner side.** Every run ends with an axe-core scan of the very same shop, so the console shows "what the scanner says" next to "what actually happened".
6. **Fixer.** For a blocked run, the fixer reads the exact HTML of the page where the shopper stopped plus the transcript, and returns minimal text patches. Each patch must match the page exactly once; the diff is shown, and the same shopper runs again.
7. **Console.** Live run view with the screenshot and the shopper's perception per step, replay, fix panel with diff, and AG Grid tables for runs and defects.

## Results so far

Measured, not estimated:

| What | Result |
|---|---|
| axe-core on the 12 defects, one defect per shop | flags 2 (`link-name`, `label`), passes 10 |
| Clean shop, every page | 0 axe-core violations |
| Screen reader shopper, clean shop (Claude Code agent as the brain) | purchased, 35 steps |
| Keyboard-only shopper, promo popup that traps focus | blocked on the cart page |
| Same shopper after the AI fix (9 patches to the cart page) | purchased, 47 steps |
| AI shopping agent, Pay button made of a `<div>` | blocked on the payment page |

The full evaluation (every defect, every persona, Claude API, holdout set) is `eval/run-eval.mjs`; its results appear in the console under *Defects and results* once it has run.

## What it does not claim

- It is not a WCAG audit or certificate, and it does not replace testing with real people who use assistive technology.
- The personas are models. The screen reader persona models focus navigation plus an elements list; it does not model browse-mode activation of elements that cannot take focus.
- The twelve defects were written by us. The holdout set was not used while writing the shopper prompts.
- In mock mode no PayPal call is made, and the console says so on every page.

## Run it

```bash
npm install
npx playwright install chromium
npm run build
npm start            # http://127.0.0.1:4300
npm test
```

Environment (`.env` in the project root, never committed):

| Variable | Purpose |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | PayPal sandbox REST app. Without them the shop runs in clearly labelled mock mode. |
| `ANTHROPIC_API_KEY` | Claude API for the live shopper and fixer. Without it, runs can be driven by a Claude Code agent. |
| `ACCESSIPAY_MODEL`, `ACCESSIPAY_FIX_MODEL` | Model ids for the shopper and the fixer (default `claude-opus-5-5`). |
| `PUBLIC_ORIGIN`, `PORT` | Public address and port of the server. |

Drive a run with a Claude Code agent or by hand:

```bash
node tools/agent.mjs start screenreader focus-trap-modal   # prints a run id
node tools/agent.mjs turn <run id>                         # instructions and what the shopper perceives
node tools/agent.mjs decide <run id> '{"thought":"...","action":"next","args":{}}'
node tools/agent.mjs fix <run id>                          # fix request for a blocked run
node tools/agent.mjs fix-reply <fix id> reply.json
```

## How PayPal and AI are used

- **PayPal Orders v2** (sandbox): the card payment on the shop's payment page, and the read-back of the order that decides whether a run succeeded. Calls go through a token bucket because the sandbox blocks an IP after about 50 requests a minute.
- **Claude**: the shopper's decision at each step (one request per step with a cached persona prompt) and the fixer's patch proposal. Prompts live in `server/engine/prompts.mjs` and `server/fixer/fixer.mjs`.
- **Playwright** drives a real Chromium; **axe-core** is the scanner it is compared with; **AG Grid** powers the runs and defects tables.

## License

MIT, see `LICENSE`.
