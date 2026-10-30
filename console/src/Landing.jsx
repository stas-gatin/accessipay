import React, { useEffect, useState } from 'react';
import { api } from './api.js';

// Every number and transcript line on this page comes from a recorded run in data/recorded.
const TRAP_RUN = '20261030-003839';
const PAY_RUN = '20261030-ee0cff';
const TRAP_LINES = [
  ['Tab', 'Focus moved to: link "Cart (1)"'],
  ['Enter', 'Opened the cart. A promo popup takes focus.'],
  ['Escape', 'Nothing happens.'],
  ['Shift+Tab', 'Focus moved to: button "Subscribe"'],
  ['Shift+Tab', 'Focus moved to: email field "Email"'],
  ['Tab', 'Focus moved to: button "Subscribe"'],
  ['Escape', 'Nothing happens.'],
  ['Give up', 'Checkout is unreachable from the keyboard.'],
];

const LEDGER_ORDER = ['20261030-a47d5d', '20261030-003839', '20261030-750001', '20261030-ee0cff', '20261030-a29ad7', '20261030-db2191'];

function Check({ ok }) {
  return ok
    ? <svg className="lp-ico ok" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" /><path d="M5.5 10.5l3 3 6-7" /></svg>
    : <svg className="lp-ico bad" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" /><path d="M6.5 6.5l7 7M13.5 6.5l-7 7" /></svg>;
}

function Ledger({ meta }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api('/api/runs').then((list) => setRows(LEDGER_ORDER.map((id) => list.find((r) => r.id === id)).filter(Boolean))).catch(() => {});
  }, []);
  const label = (r) => {
    const shop = r.defects.length ? meta.defects.find((d) => d.id === r.defects[0])?.short : 'Clean shop';
    const task = r.goalId === 'agentic' ? 'Agentic buyer task' : shop;
    return `${task}${r.patches?.length ? ', after AI fix' : ''}`;
  };
  return (
    <div className="lp-ledger">
      <div className="lp-ledger-head" aria-hidden="true">
        <span>Customer</span><span>Shop</span><span>Scanner</span><span>Outcome</span><span className="num">Amount</span><span>PayPal order</span>
      </div>
      <ul className="lp-ledger-list" aria-label="Recorded runs against the PayPal sandbox">
      {rows.map((r) => {
        const ok = r.outcome?.status === 'purchased';
        return (
          <li key={r.id}><a className="lp-ledger-row" href={`#/runs/${r.id}`}>
            <span className="strong">{meta.personas[r.persona]?.label}<span className="sr-only">,</span></span>
            <span>{label(r)}<span className="sr-only">,</span></span>
            <span>{r.scan?.totalViolations ?? '—'} violations<span className="sr-only">,</span></span>
            <span><span className={`lp-status ${ok ? 'ok' : 'bad'}`}>{ok ? 'Paid' : 'Blocked'}</span><span className="sr-only">,</span></span>
            <span className="num mono">{r.payment ? `$${r.payment.amount.toFixed(2)}` : <span aria-hidden="true">—</span>}</span>
            <span className="mono">{r.payment ? <><span className="sr-only">PayPal order </span>{r.payment.orderId}</> : 'no order'}</span>
          </a></li>
        );
      })}
      </ul>
      {!rows.length && <p className="lp-note" style={{ padding: 20 }}>Loading recorded runs…</p>}
    </div>
  );
}

export default function Landing({ meta }) {
  const total = meta.defects.length;
  const axe = meta.defects.filter((d) => d.axeExpected).length;
  return (
    <div className="lp">
      {/* Hero */}
      <section className="lp-hero" aria-labelledby="lp-h1">
        <div className="lp-mesh" aria-hidden="true" />
        <div className="lp-wrap lp-hero-copy">
          <p className="lp-kicker"><span className="lp-dot" aria-hidden="true" />Accessibility, measured in completed payments</p>
          <h1 id="lp-h1">Your checkout passes the scanner.<br />Your customers still can’t pay.</h1>
          <p className="lp-sub">
            AccessiPay sends real shoppers through your checkout: a customer who uses a screen reader, a customer who cannot use a mouse,
            and an AI shopping agent. A run counts only when PayPal confirms the order. When a customer gets stuck, AI patches the page and the same customer tries again.
          </p>
          <div className="lp-cta center">
            <a className="lp-btn primary" href={`#/runs/${PAY_RUN}`}>Watch a blocked payment</a>
            <a className="lp-btn" href="#/test">Run a test</a>
          </div>
        </div>

        <figure className="lp-stage lp-wrap" aria-label="A recorded run: the scanner reports no violations, yet an AI shopping agent cannot press the Pay button">
          <div className="lp-browser">
            <div className="lp-browser-bar" aria-hidden="true"><i /><i /><i /><span>pine-and-peak.demo / pay</span></div>
            <div className="lp-shotwrap">
              <img src="/img/shop-pay-div.jpg" alt="The demo shop's payment page with a normal-looking Pay $54.00 button." />
              <span className="lp-ring" aria-hidden="true" />
              <span className="lp-ring-label" aria-hidden="true">Looks like a button. It is a &lt;div&gt;.</span>
            </div>
          </div>
          <div className="lp-float lp-float-scan">
            <Check ok />
            <div><strong>axe-core</strong><span>0 violations on 4 pages</span></div>
          </div>
          <div className="lp-float lp-float-hear">
            <div><strong>What the agent reads</strong>
              <pre className="lp-mini">{`- textbox "Security code"
- text: Pay $54.00`}</pre>
              <span>No button to press.</span>
            </div>
          </div>
          <div className="lp-float lp-float-run">
            <Check ok={false} />
            <div><strong>AI shopping agent</strong><span>Blocked at payment, 20 steps</span></div>
          </div>
          <div className="lp-float lp-float-paid">
            <Check ok />
            <div><strong>After a one-line AI fix</strong><span>PayPal order <span className="mono">0CS292858A5878721</span> · COMPLETED</span></div>
          </div>
        </figure>

        <dl className="lp-kpis lp-wrap">
          <div><dt>Checkout defects in the demo shop</dt><dd>{total}</dd></div>
          <div><dt>Flagged by axe-core</dt><dd>{axe} of {total}</dd></div>
          <div><dt>Kinds of customer</dt><dd>3</dd></div>
          <div><dt>Judge of success</dt><dd>A paid PayPal order</dd></div>
        </dl>
      </section>

      <div className="lp-wrap lp-built" aria-label="Built with">
        <span>Built on</span><b>PayPal Orders v2</b><b>Claude</b><b>Playwright</b><b>axe-core</b><b>AG Grid</b>
      </div>

      {/* Two verdicts */}
      <section className="lp-section lp-wrap" aria-labelledby="lp-two">
        <p className="lp-eyebrow">The gap</p>
        <h2 id="lp-two">Same page. Two verdicts.</h2>
        <p className="lp-lead">A rule scanner checks what the code says. A customer checks whether the payment goes through. On this cart page they disagree.</p>
        <div className="lp-two">
          <article className="lp-card lp-report">
            <header><span className="lp-tag">Scanner report</span><span className="lp-badge ok">Passed</span></header>
            <p className="lp-big ok">0 violations</p>
            <ul className="lp-checks">
              <li><Check ok />Buttons have accessible names</li>
              <li><Check ok />Form fields have labels</li>
              <li><Check ok />Colour contrast meets AA</li>
              <li><Check ok />Page has a language and landmarks</li>
            </ul>
            <p className="lp-note">axe-core, default rules, on every page of the checkout.</p>
          </article>
          <article className="lp-card lp-transcript">
            <header><span className="lp-tag">Keyboard-only customer</span><span className="lp-badge bad">Could not pay</span></header>
            <ol>
              {TRAP_LINES.map(([key, text], i) => (
                <li key={i}><kbd>{key}</kbd><span>{text}</span></li>
              ))}
            </ol>
            <a className="lp-link" href={`#/runs/${TRAP_RUN}`}>Open the full run, step by step →</a>
          </article>
        </div>
      </section>

      {/* How it works */}
      <section className="lp-section lp-alt" aria-labelledby="lp-how">
        <div className="lp-wrap">
          <p className="lp-eyebrow">How it works</p>
          <h2 id="lp-how">From a failed checkout to a paid order.</h2>
          <div className="lp-steps">
            <article className="lp-card lp-step">
              <span className="lp-step-n">1</span>
              <h3>A customer shops</h3>
              <p>Each shopper perceives the page its own way and acts only through the keyboard or the accessibility tree. No pixels, no shortcuts.</p>
              <pre className="lp-code" aria-label="What the screen reader shopper hears">{`- heading "Your cart"
- button "button"
- button "button"
- text: Pay now`}</pre>
            </article>
            <article className="lp-card lp-step">
              <span className="lp-step-n">2</span>
              <h3>PayPal is the judge</h3>
              <p>Success means an order the PayPal API reports as COMPLETED. A shopper saying “done” does not count.</p>
              <div className="lp-receipt" aria-label="Example PayPal sandbox order">
                <div><span>Order</span><b className="mono">0CS292858A5878721</b></div>
                <div><span>Amount</span><b className="mono">$54.00</b></div>
                <div><span>Status</span><b className="ok">COMPLETED</b></div>
              </div>
            </article>
            <article className="lp-card lp-step">
              <span className="lp-step-n">3</span>
              <h3>AI fixes the page</h3>
              <p>The fixer reads the exact HTML where the customer stopped and returns the smallest patch. Then the same customer tries again.</p>
              <pre className="lp-code lp-diff" aria-label="The fix for the Pay button">
                <span className="del">{'- <div class="btn primary">Pay $54.00</div>'}</span>{'\n'}
                <span className="add">{'+ <button type="submit" class="primary">Pay $54.00</button>'}</span>
              </pre>
            </article>
          </div>
        </div>
      </section>

      {/* Before and after */}
      <section className="lp-section lp-wrap" aria-labelledby="lp-ba">
        <p className="lp-eyebrow">One patch</p>
        <h2 id="lp-ba">The AI agent could not find the Pay button. Then it could.</h2>
        <div className="lp-ba">
          <figure className="lp-shot">
            <img src="/img/shop-pay-div.jpg" alt="The payment page. The Pay button looks normal but is a plain div." />
            <figcaption><span className="lp-badge bad">Before</span> The Pay button is a <code>&lt;div&gt;</code>. It looks fine; an agent cannot press it. Blocked after 20 steps.</figcaption>
          </figure>
          <figure className="lp-shot">
            <img src="/img/shop-done-sandbox.jpg" alt="The order confirmation page with the PayPal sandbox order number and status COMPLETED." />
            <figcaption><span className="lp-badge ok">After</span> One patch: a real <code>&lt;button&gt;</code>. Paid in 18 steps, PayPal order COMPLETED.</figcaption>
          </figure>
        </div>
      </section>

      {/* Ledger */}
      <section className="lp-section lp-alt" aria-labelledby="lp-ledger">
        <div className="lp-wrap">
          <p className="lp-eyebrow">Results</p>
          <h2 id="lp-ledger">Every run settles as a payment, or it doesn’t.</h2>
          <p className="lp-lead">Six recorded runs against the PayPal sandbox. Open any row to replay it.</p>
          <Ledger meta={meta} />
        </div>
      </section>

      {/* Defect gallery */}
      <section className="lp-section lp-wrap" aria-labelledby="lp-defects">
        <p className="lp-eyebrow">The defects</p>
        <h2 id="lp-defects">Twelve checkout mistakes. They all look fine.</h2>
        <p className="lp-lead">Each one is a real pattern from live shops. axe-core flags {axe} of {total}. The rest only show up when a customer tries to pay.</p>
        <div className="lp-gallery">
          {meta.defects.map((d) => (
            <figure key={d.id} className="lp-card lp-defect">
              <div className="lp-defect-img"><img src={`/img/defects/${d.id}.png`} alt="" loading="lazy" /></div>
              <figcaption>
                <strong>{d.short}</strong>
                <span>{d.title}.</span>
                <span className={`lp-badge ${d.axeExpected ? 'ok' : 'bad'}`}>{d.axeExpected ? 'Scanner flags it' : 'Scanner misses it'}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Agentic commerce */}
      <section className="lp-section lp-dark" aria-labelledby="lp-agent">
        <div className="lp-wrap lp-agent">
          <div>
            <p className="lp-eyebrow light">Agentic commerce</p>
            <h2 id="lp-agent">AI shoppers read your page the way screen readers do.</h2>
            <p className="lp-lead light">
              A checkout a blind customer cannot finish is a checkout an AI agent cannot finish either. AccessiPay tests both,
              and checks that the agent bought what the customer actually asked for.
            </p>
          </div>
          <div className="lp-chat" aria-label="A recorded agentic buyer run">
            <div className="lp-bubble user">Get me something that keeps me dry on hikes, under $100, and I need it fast.</div>
            <div className="lp-bubble agent">Rain Jacket, $79.00, with express delivery. The backpack and the bottle do not keep you dry.</div>
            <div className="lp-receipt dark">
              <div><span>Total</span><b className="mono">$94.00</b></div>
              <div><span>PayPal order</span><b className="mono">6U503846E1796980G</b></div>
              <div><span>Right item</span><b className="ok">Yes</b></div>
            </div>
            <a className="lp-link light" href="#/runs/20261030-db2191">Replay the agent’s run →</a>
          </div>
        </div>
      </section>

      {/* For PayPal + honesty */}
      <section className="lp-section lp-wrap lp-split" aria-labelledby="lp-why">
        <div>
          <p className="lp-eyebrow">Why it matters</p>
          <h2 id="lp-why">Every blocked customer is a payment that never happens.</h2>
          <p className="lp-lead">
            The European Accessibility Act has applied to online shops since 28 June 2025. AI agents are starting to shop for people.
            Both need the same thing: a checkout that works without a mouse and without eyes on the screen.
            For PayPal, a check like this could live next to the integration guide: run it before you go live, see the payments you would lose.
          </p>
        </div>
        <aside className="lp-card lp-honest" aria-labelledby="lp-honest-t">
          <h3 id="lp-honest-t">What we do not claim</h3>
          <ul>
            <li>Not a WCAG certificate, and not a replacement for testing with people who use assistive technology.</li>
            <li>The shoppers are models: the screen reader one navigates by focus and an elements list.</li>
            <li>The twelve defects were written by us; a holdout set was kept out of prompt tuning.</li>
            <li>All payments run in the PayPal sandbox with test cards.</li>
          </ul>
        </aside>
      </section>

      <section className="lp-final" aria-labelledby="lp-final-t">
        <div className="lp-mesh" aria-hidden="true" />
        <div className="lp-wrap">
          <h2 id="lp-final-t">See your checkout through your customers.</h2>
          <div className="lp-cta center">
            <a className="lp-btn primary" href="#/test">Run a test</a>
            <a className="lp-btn" href="#/analytics">See the analytics</a>
            <a className="lp-btn" href="#/runs">Browse all runs</a>
          </div>
        </div>
      </section>

      <footer className="lp-footer lp-wrap">
        <span>AccessiPay · built for the PayPal AI Hackathon 2026</span>
        <span>Demo shop and payments run in the PayPal sandbox. No real money moves.</span>
      </footer>
    </div>
  );
}
