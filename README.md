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

Measured, not estimated. Runs below used the real PayPal sandbox; the shopper's decisions came from Claude Code agents driving `tools/agent.mjs` (the built-in Claude API brain is implemented but has not been run yet).

| What | Result |
|---|---|
| axe-core on the 13 defects, one defect per shop | flags 2 (`link-name`, `label`), passes 11 |
| Clean shop, every page | 0 axe-core violations in the shop's own code (axe also reports 4 best-practice notices inside PayPal's hosted card fields; we list those separately) |
| Screen reader shopper, clean shop, paying through PayPal Card Fields | bought it in 36 steps, PayPal sandbox order `COMPLETED` |
| Keyboard-only shopper, promo popup that traps focus (scanner: 0) | blocked on the cart page after 15 steps |
| Same shopper after the AI fix (7 patches to the cart page) | bought it in 49 steps, order `COMPLETED` |
| AI shopping agent, Pay button made of a `<div>` (scanner: 0) | blocked on the payment page after 22 steps |
| Same agent after the AI fix (the `<div>` became a `<button>`, plus 4 group names) | bought it in 19 steps, order `COMPLETED` |
| Keyboard-only shopper, 25 category links and no skip link (scanner: 0), 2 runs | paid in 62 and 82 steps, 165 and 198 keypresses |
| Same shopper after the AI fix (one skip link on every page), 2 runs | paid in 52 steps both times, 155 keypresses: medians 28% fewer steps, 15% fewer keys, an estimated 23% less time (keystroke-level model) |
| AI shopping agent, task stated as a need ("keep me dry on hikes, under $100, fast") | chose the Rain Jacket with express delivery, $94.00, order `COMPLETED` |

### Real sites

On real sites the shopper goes as far as the payment step and stops: the engine refuses to pay, place an order, type card data, sign in or type passwords, and a network guard blocks anything but reading to payment providers. Before a run it reads robots.txt; a bot check, a maintenance page or HTTP 403/429 ends the run as *not testable*: AccessiPay never tries to get past bot protection. There are at least 3 seconds between actions, and each large retailer is visited at most once a day.

**Open-source platform demos** (named; findings to be checked by hand before any issue is filed):

| Site | Platform | Customer | Outcome | axe-core (own code) | What blocked or confused the customer |
|---|---|---|---|---|---|
| hydrogen.shop | Shopify Hydrogen | AI agent | reached the payment form, 7 steps | 24 issues on 4 pages | card fields are iframes with no accessible name; variant options do not say which is selected; "added to cart" is not announced |
| next.medusajs.com | Medusa | AI agent | reached "Place order", 28 steps | 52 issues on 6 pages | every checkout text field and the country select have no accessible name; the email field is named by its error text |
| storefront.saleor.io | Saleor | AI agent | stopped at payment, 28 steps | 49 issues on 5 pages | the demo has no payment gateway configured (a demo setting, not counted as an accessibility blocker) |
| demo.solidus.io | Solidus | keyboard only | reached payment, 67 steps | 42 issues | no skip link; unnamed header controls; every product link reads "SHOP NOW"; focus resets to the top after each step |
| v2.demo.sylius.com | Sylius | keyboard only | ran out of its 90-step budget on the address form | 134 issues | no skip link; size options unreachable by keyboard; unnamed icon link and "Value" field before the content |

Two more demos were tried and not counted: one URL was a marketing page with no shop, and one demo's checkout did not render a form even with a mouse.

**Large retailers** (published only as Retailer A to N): 14 well-known stores were checked. 7 were not testable (5 answered HTTP 403 to an automated browser, 1 showed a press-and-hold bot check, 1 showed a maintenance page). Of the rest, the AI agent reached the payment form on 3 so far (10 to 17 steps), with findings such as identically named "Add to cart" and "Quick add" buttons, promo and country pop-ups that block clicks without a dialog role, and a pre-ticked marketing checkbox. 4 runs are being redone after engine fixes (dialogs on long pages, clicks through a field's own label, clicks that start a page load), on another day because of the once-a-day rule.

Most axe-core issues on these sites are colour contrast and landmark rules; the problems that actually stopped or slowed the customer are mostly different ones.

These runs, the demo shop runs and their fixes are in `data/recorded/` and can be replayed in the console. The full evaluation (every defect, every persona, Claude API, holdout set) is `eval/run-eval.mjs`; its results appear under *Defects and results* once it has run.

## What it does not claim

- It is not a WCAG audit or certificate, and it does not replace testing with real people who use assistive technology.
- The personas are models. The screen reader persona models focus navigation plus an elements list; it does not model browse-mode activation of elements that cannot take focus.
- The twelve defects were written by us. The holdout set was not used while writing the shopper prompts.
- On real sites the agent stops before paying, so "reached payment" means a payment form or an enabled pay or place-order button was on screen, not that a payment would have succeeded. On one-page checkouts the payment form is on the same page as the address form.
- Shopper decisions in the recorded runs came from Claude models through the engine's agent interface; a different model, or a person, may take more or fewer steps.
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
| `PORT` | Port of the server (default 4300). |

Drive a run with a Claude Code agent or by hand:

```bash
node tools/agent.mjs start screenreader focus-trap-modal   # prints a run id
node tools/agent.mjs turn <run id>                         # instructions and what the shopper perceives
node tools/agent.mjs decide <run id> '{"thought":"...","action":"next","args":{}}'
node tools/agent.mjs fix <run id>                          # fix request for a blocked run
node tools/agent.mjs fix-reply <fix id> reply.json
```

## How PayPal and AI are used

- **PayPal Orders v2** (sandbox): the card payment on the shop's payment page, and the read-back of the order that decides whether a run succeeded. Verified against the live sandbox: create with a card payment source, capture, read back as `COMPLETED`, refund (`npm test` includes this when sandbox keys are present). Calls go through a token bucket because the sandbox blocks an IP after about 50 requests a minute.
- The demo shop posts test card numbers to its own server and on to PayPal. That is fine for sandbox test cards only; a production checkout would use PayPal's hosted card fields so card data never touches the merchant server.
- **Claude**: the shopper's decision at each step (one request per step with a cached persona prompt) and the fixer's patch proposal. Prompts live in `server/engine/prompts.mjs` and `server/fixer/fixer.mjs`.
- **Playwright** drives a real Chromium; **axe-core** is the scanner it is compared with; **AG Grid** powers the runs and defects tables.

## License

MIT, see `LICENSE`.
