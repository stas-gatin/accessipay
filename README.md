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

**Open-source platform demos** (named; findings to be checked by hand before any issue is filed). Each demo gets each customer type; "reached payment" means the payment form or the payment method choice was on screen:

| Platform demo | Screen reader | Keyboard only | AI agent |
|---|---|---|---|
| Shopify Hydrogen | reached payment, 10 steps | reached payment, 29 steps | reached payment, 7 steps |
| Medusa | not counted: the demo answered HTTP 500 | not run (demo down) | reached "Place order", 28 steps (30 Oct) |
| Saleor | stopped at payment: demo has no payment gateway | ran out of 90 steps on the address form | stopped at payment: no gateway |
| Solidus | reached payment, 27 steps | reached payment, 67 steps | reached payment, 13 steps |
| Sylius | reached the payment method choice, 30 steps | ran out of 90 steps on the address form | reached the payment method choice, 25 steps |
| Shopware Frontends | reached payment, 27 steps | reached payment, 59 steps | not testable: a bot check never finished |
| Next.js Commerce | not testable: a visual puzzle CAPTCHA appeared at checkout | not testable: same CAPTCHA | not testable: same CAPTCHA |
| Magento 2 (Magebit demo) | reached payment, 28 steps | reached payment, 88 steps | reached payment, 18 steps |

What the customers met most often: buttons and links with no name or the same name on every product ("Add to cart", "SHOP NOW"), focus thrown to the top of the page after every step, nothing announced while a page or form section loads, size and colour options that do not say which one is selected, and long forms that change silently (a state list swapped after a country choice, an item named "test" appearing in the cart). On Next.js Commerce a visual puzzle CAPTCHA ("click on all cells where two lines overlap") appeared at checkout after the email was typed; a blind customer cannot solve it.

**Large retailers** (published only as Retailer A, B, ...): 34 well-known stores were checked. 13 were not testable: most answer HTTP 403 to an automated browser, others showed a press-and-hold bot check, an "unusual activity" page, a maintenance page, refused every Add to cart, or ended guest checkout on a sign-in page. Of the runs that could start, the screen reader customer reached the payment form on 7 of 7 and the AI agent on 3 of 3. Recurring findings: three overlapping pop-ups before the shop, cookie banners with no plain Decline button, carts that first announce "0 items" after an add, raw template text in names ("{{ count }} items", "undefined Artículos en la cesta"), paid add-ons (package protection) already in the bag, and pre-ticked marketing checkboxes. A night sweep on 31 October was discarded: too many runs at once slowed every step past the decision timeout. Those retailers are visited again on another day, at most six runs at a time.

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
