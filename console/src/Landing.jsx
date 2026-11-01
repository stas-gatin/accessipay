import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import HeroReplay from './site/HeroReplay.jsx';
import { Chain, KindLegend } from './site/BusinessChain.jsx';
import { BrandImg, CountUp, Reveal } from './site/motion.jsx';
import {
  Arrow, SectionHead, TwoVerdicts, JourneyMap, EffortBlock, RealShops, OwnerOutputs, MethodStrip,
} from './site/blocks.jsx';
import { RUNS, EAA_DATE } from './site/facts.js';

// The home page. Every number comes from a recorded run (see site/facts.js) or from the API.
// Surfaces alternate light / white / navy so no two neighbouring blocks share a layout.
export default function Landing({ meta }) {
  const total = meta.defects.length;
  const axe = meta.defects.filter((d) => d.axeExpected).length;
  const [orders, setOrders] = useState(null);
  const [shops, setShops] = useState(null);
  useEffect(() => { api('/api/sites').then((l) => setShops(l.filter((x) => x.complete && !x.notTestable && !x.sandbox).length)).catch(() => setShops(null)); }, []);
  useEffect(() => {
    api('/api/runs')
      .then((list) => setOrders(list.filter((r) => r.payment?.status === 'COMPLETED' && r.payment?.mode === 'sandbox' && !/^MOCK/.test(r.payment.orderId)).length))
      .catch(() => setOrders(null));
  }, []);

  return (
    <div className="lp">
      {/* 1. Hero: navy, the real run pair replayed */}
      <section className="s-navy hero-lp" aria-labelledby="hero-t">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow-lp light">Accessibility, measured in completed payments</p>
            <h1 id="hero-t">Scanners pass your checkout. Can your customers actually pay?</h1>
            <p className="hero-sub">
              AccessiPay sends a screen reader user, a keyboard{'\u2011'}only user and an AI shopping agent to buy.
              A test passes only when PayPal confirms the order. AI fixes what blocked them, and the same customer tries again.
            </p>
            <div className="cta-row">
              <a className="btn-lp primary" href="#/test">Run a test</a>
              <a className="btn-lp ghost-light" href="#/own-site">Test your shop</a>
            </div>
            <ol className="hero-proof" aria-label="One recorded case, before and after the fix">
              <li className="bad"><a href={`#/runs/${RUNS.agentBlocked}`}><b>Blocked</b><span>AI agent at Payment. The scanner saw no problem.</span></a></li>
              <li className="fix"><a href={`#/report/case/${RUNS.agentBlocked}`}><b>AI fix</b><span>5 changes to the page</span></a></li>
              <li className="ok"><a href={`#/runs/${RUNS.agentFixed}`}><b>Paid</b><span>PayPal: COMPLETED (sandbox)</span></a></li>
            </ol>
            <p className="hero-fine">The customers are simulated. Payments run in the PayPal sandbox.</p>
          </div>
          <div className="hero-stage">
            <HeroReplay />
          </div>
        </div>
      </section>

      {/* 2. Proof strip */}
      <section className="s-white proof" aria-label="Results in numbers">
        <div className="wrap">
          <Reveal as="ul" className="proof-grid" stagger>
            <li><span className="pv"><CountUp value={total} /></span><span className="pl">checkout defects in the demo shop</span><a href="#/method">How it works</a></li>
            <li><span className="pv"><CountUp value={axe} /><span className="of"> of {total}</span></span><span className="pl">flagged by axe-core</span><a href="#/analytics">Scanner results</a></li>
            <li><span className="pv">{orders == null ? '—' : <CountUp value={orders} />}</span><span className="pl">orders confirmed by PayPal (sandbox)</span><a href="#/analytics">Analytics</a></li>
            {shops ? <li><span className="pv"><CountUp value={shops} /></span><span className="pl">real shops tested by all three customers</span><a href="#/results">Results</a></li>
              : <li><span className="pv"><CountUp value={3} /></span><span className="pl">kinds of simulated customer</span><a href="#/customers">Meet them</a></li>}
          </Reveal>
          <div className="built" aria-label="Built on">
            <span>Built on</span><b>PayPal Orders v2</b><b>Claude</b><b>Playwright</b><b>axe-core</b><b>AG Grid</b>
          </div>
        </div>
      </section>

      {/* 3. The gap */}
      <section className="s-light sec" aria-labelledby="gap-t">
        <div className="wrap">
          <SectionHead eyebrow="The gap" id="gap-t" title="Same page. Two verdicts."
            lead="A rule scanner checks what the code says. A customer checks whether the payment goes through. On this cart page they disagree." />
          <TwoVerdicts />
        </div>
      </section>

      {/* 4. Who it is for */}
      <section className="s-white sec" aria-labelledby="who-t">
        <div className="wrap">
          <SectionHead eyebrow="Who it is for" id="who-t" title="One checkout. Four groups who need it to work." />
          <Reveal className="who" stagger>
            <article className="who-card who-people">
              <BrandImg name="02-keyboard.png" art="keyboard" alt="Blank keyboard keys, with the Tab key outlined in green light." ratio="16 / 9" />
              <div className="who-body">
                <p className="who-k">People with disabilities</p>
                <h3>Customers who navigate without a mouse or without seeing the screen.</h3>
                <p>A promo popup trapped our keyboard{'\u2011'}only customer on the cart page while axe{'\u2011'}core reported no problem. After the AI fix, the same customer paid, and PayPal confirmed it.</p>
                <a className="lp-link" href="#/customers">The simulated customers <Arrow /></a>
              </div>
            </article>
            <article className="who-card who-agents">
              <BrandImg name="03-ai-agents.png" art="agents" alt="A glass shopping bag holding a green coin, with paths leading into it." ratio="16 / 9" />
              <div className="who-body">
                <p className="who-k">AI shopping agents</p>
                <h3>Agents read your page the way screen readers do.</h3>
                <p>Our agent could not find a Pay button that was a <code>&lt;div&gt;</code>. After the AI turned it into a real button, the agent paid, and PayPal confirmed it.</p>
                <a className="lp-link" href="#agents">How agents shop <Arrow /></a>
              </div>
            </article>
            <article className="who-card who-merchants">
              <BrandImg name="04-merchants.png" art="merchants" alt="A stack of shipping boxes beside a card terminal printing a receipt." ratio="16 / 9" />
              <div className="who-body">
                <p className="who-k">Merchants</p>
                <h3>Find the payments you lose before your customers do.</h3>
                <p>Get the fix as code, not a list of rule IDs, with a step-by-step replay of where each customer got stuck. The European Accessibility Act has applied to online shops in the EU since {EAA_DATE}.</p>
                <a className="lp-link" href="#owner">What you get <Arrow /></a>
              </div>
            </article>
            <article className="who-card who-paypal">
              <BrandImg name="05-business-chain.png" art="chain" alt="Many thin lines of light converging into one green coin." ratio="16 / 9" />
              <div className="who-body">
                <p className="who-k">PayPal</p>
                <h3>Every unblocked checkout is a payment that can reach PayPal.</h3>
                <p>A check that can sit next to the integration guide: run it before go-live and see which customers could not pay.</p>
                <a className="lp-link" href="#/paypal">For PayPal <Arrow /></a>
              </div>
            </article>
          </Reveal>
        </div>
      </section>

      {/* 5. AI shopping agents: navy */}
      <section className="s-navy sec" id="agents" aria-labelledby="agent-t">
        <div className="wrap agent-grid">
          <Reveal className="agent-copy">
            <p className="eyebrow-lp light">Agentic commerce</p>
            <h2 id="agent-t">A checkout a blind customer cannot finish is a checkout an AI agent cannot finish either.</h2>
            <p className="lead-lp light">AccessiPay tests both, and checks that the agent bought what the person actually asked for.</p>
            <pre className="codeblock on-navy" tabIndex={0} aria-label="The line of the fix that let the agent pay"><span className="c-meta">The fix that unblocked the agent (pay.html)</span>{'\n'}<span className="del">- {'<div class="btn primary">Pay $54.00</div>'}</span>{'\n'}<span className="add">+ {'<button type="submit" class="btn primary">'}</span>{'\n'}<span className="add">+ {'  Pay $54.00</button>'}</span></pre>
          </Reveal>
          <Reveal className="chat" role="group" aria-label="A recorded agentic buyer run">
            <div className="bubble user">Get me something that keeps me dry on hikes, under $100, and I need it fast.</div>
            <div className="bubble typing" aria-hidden="true"><i /><i /><i /></div>
            <div className="bubble agent">Found it: the Rain Jacket keeps you dry and costs $79, under $100. You need it fast, so I chose express delivery: $94.00 in total.</div>
            <div className="receipt-dark">
              <div><span>Total</span><b className="mono">$94.00</b></div>
              <div><span>PayPal</span><b>Payment confirmed</b></div>
              <div><span>Right item</span><b>Yes: rain jacket, express</b></div>
            </div>
            <a className="lp-link light" href={`#/runs/${RUNS.agentClean}`}>Replay the agent’s run <Arrow /></a>
          </Reveal>
        </div>
      </section>

      {/* 6. Method strip */}
      <section className="s-light sec" aria-labelledby="method-t">
        <div className="wrap">
          <SectionHead eyebrow="The method" id="method-t" title="Nine stages, from the first visit to a fix you can ship."
            lead="We measure the path, not just the rules: whether a simulated customer can finish, where it gets stuck, and how that changes after the fix." />
          <BrandImg name="06-method.png" art="method" alt="A relief map with a dotted green path climbing through waypoints to a summit." ratio="21 / 8" className="sec-banner" />
          <MethodStrip />
          <p className="more"><a className="lp-link" href="#/method">See every stage with its real artifact <Arrow /></a></p>
        </div>
      </section>

      {/* 7. Can they finish? */}
      <section className="s-white sec" aria-labelledby="jm-t">
        <div className="wrap">
          <SectionHead eyebrow="Can they finish?" id="jm-t" title="Where each customer stopped, and what changed after the fix."
            lead="Blocked to paid is not “faster”: it is impossible becoming possible. Switch between before and after the fix." />
          <JourneyMap />
        </div>
      </section>

      {/* 8. PayPal confirms */}
      <section className="s-light sec" aria-labelledby="effort-t">
        <div className="wrap">
          <SectionHead eyebrow="Slower, not blocked" id="effort-t" title="Not blocked, just slower. Measured."
            lead="Some problems never stop a customer; they make every page take longer. We send the same customer before and after the fix and count what it took." />
          <EffortBlock />
        </div>
      </section>
      {/* 9. Outputs for the owner */}
      <section className="s-white sec" id="owner" aria-labelledby="owner-t">
        <div className="wrap">
          <SectionHead eyebrow="What the owner gets" id="owner-t" title="Not a list of rule IDs. A fix you can ship."
            lead="Four outputs from every test. The examples below come from the recorded runs." />
          <OwnerOutputs />
        </div>
      </section>

      {/* 10. Real shops */}
      <section className="s-light sec" id="real-sites" aria-labelledby="real-t">
        <div className="wrap">
          <SectionHead eyebrow="Outside our demo shop" id="real-t" title="Real shops, three customers each."
            lead="Every shop gets the same three customers. Nobody pays on a shop we test without its owner, so the pass mark there is different: a customer passes when it reaches the payment step. No order, no card data. Shops are shown without their names. An owner can connect a staging copy of the shop with its PayPal sandbox, and then the customers pay and PayPal confirms." />
          <BrandImg name="07-real-sites.png" art="sites" alt="Three small shop fronts side by side with navy, white and green awnings." ratio="21 / 8" className="sec-banner" />
          <RealShops />
          <p className="sweep-own">Many shops turn automated browsers away, and AccessiPay never tries to get past that. <a className="lp-link" href="#/own-site">Connect your own site and let the test in <Arrow /></a></p>
        </div>
      </section>

      {/* 11. Business chain + calculator: navy */}
      <section className="s-navy sec" aria-labelledby="chain-t">
        <div className="wrap">
          <SectionHead eyebrow="For PayPal" id="chain-t" light title="From a fixed checkout to PayPal volume."
            lead="Step 2 comes from our recorded runs. Everything after it is arithmetic on your own numbers.">
            <KindLegend />
          </SectionHead>
          <Chain />
          <p className="more"><a className="lp-link light" href="#/paypal">Put in your own numbers <Arrow /></a></p>
        </div>
      </section>

      {/* 13. Honest limits */}
      <section className="s-light sec" aria-labelledby="limits-t">
        <div className="wrap limits">
          <SectionHead eyebrow="Honest limits" id="limits-t" title="What we do not claim." />
          <Reveal as="ul" className="limits-list" stagger>
            <li><b>Simulated customers.</b> Our screen reader and keyboard customers are models of how assistive technology exposes a page, not people with disabilities. They do not replace testing with disabled users.</li>
            <li><b>Not a certificate.</b> Not a WCAG audit and not proof of compliance.</li>
            <li><b>Our own defects.</b> The {total} demo-shop defects were written by us. That is why we also send the same customers to real shops.</li>
            <li><b>Steps, not seconds.</b> Run time is mostly the model thinking, so we never show it as a customer’s time.</li>
            <li><b>Sandbox only.</b> Every payment runs in the PayPal sandbox with test cards.</li>
          </Reveal>
          <p className="more"><a className="lp-link" href="#/method">Everything we measure and do not measure <Arrow /></a></p>
        </div>
      </section>

      {/* 14. Final CTA */}
      <section className="s-navy final" aria-labelledby="final-t">
        <div className="wrap">
          <BrandImg name="08-cover.png" alt="" ratio="16 / 9" className="final-img" />
          <h2 id="final-t">See your checkout through your customers.</h2>
          <div className="cta-row center">
            <a className="btn-lp primary" href="#/test">Run a test</a>
            <a className="btn-lp ghost-light" href="#/own-site">Test your shop</a>
            <a className="btn-lp ghost-light" href="#/results">See the results</a>
          </div>
        </div>
      </section>
    </div>
  );
}
