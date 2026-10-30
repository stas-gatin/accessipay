import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { LogoMark } from './Logo.jsx';
import HeroReplay from './site/HeroReplay.jsx';
import { Chain, Calculator, KindLegend } from './site/BusinessChain.jsx';
import { BrandImg, CountUp, Reveal } from './site/motion.jsx';
import {
  Arrow, SectionHead, TwoVerdicts, JourneyMap, PayPalConfirms, OwnerOutputs, RealSites, MethodStrip, Ledger, SiteFooter,
} from './site/blocks.jsx';
import { RUNS, ORDERS, PAY_FIX, EAA_DATE } from './site/facts.js';

// The home page. Every number comes from a recorded run (see site/facts.js) or from the API.
// Surfaces alternate light / white / navy so no two neighbouring blocks share a layout.
export default function Landing({ meta }) {
  const total = meta.defects.length;
  const axe = meta.defects.filter((d) => d.axeExpected).length;
  const [orders, setOrders] = useState(null);
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
              AccessiPay sends a screen reader user, a keyboard-only user and an AI shopping agent to buy.
              PayPal confirms who paid. AI fixes what blocked the rest, then retests.
            </p>
            <div className="cta-row">
              <a className="btn-lp primary" href="#/test">Run a test</a>
              <a className="btn-lp ghost-light" href={`#/runs/${RUNS.agentBlocked}`}>Open the recorded run</a>
            </div>
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
            <li><span className="pv"><CountUp value={total} /></span><span className="pl">checkout defects in the demo shop</span><a href="#/defects">See them</a></li>
            <li><span className="pv"><CountUp value={axe} /><span className="of"> of {total}</span></span><span className="pl">flagged by axe-core</span><a href="#/defects">Scanner results</a></li>
            <li><span className="pv"><CountUp value={3} /></span><span className="pl">kinds of simulated customer</span><a href="#/customers">Meet them</a></li>
            <li><span className="pv">{orders == null ? '—' : <CountUp value={orders} />}</span><span className="pl">PayPal sandbox orders COMPLETED</span><a href="#/runs">All runs</a></li>
            <li><span className="pv"><CountUp value={3} /></span><span className="pl">open-source storefront demos tested</span><a href="#real-sites">Findings</a></li>
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
          <SectionHead eyebrow="Who it is for" id="who-t" title="One checkout. Four people who need it to work." />
          <Reveal className="who" stagger>
            <article className="who-card who-people">
              <BrandImg name="02-keyboard.png" art="keyboard" alt="Blank keyboard keys, with the Tab key outlined in green light." ratio="16 / 9" />
              <div className="who-body">
                <p className="who-k">People with disabilities</p>
                <h3>Customers who navigate without a mouse or without seeing the screen.</h3>
                <p>Our simulated keyboard-only customer was trapped by a promo popup on the cart page while axe-core reported 0 violations. After a 7-patch AI fix, the same customer bought in 46 steps, PayPal order <span className="mono">{ORDERS.keyboardFixed.id}</span>.</p>
                <p className="who-also">Also: a broken trackpad, a tremor, a temporary injury, people who simply prefer the keyboard.</p>
                <a className="lp-link" href="#/customers">The simulated customers <Arrow /></a>
              </div>
            </article>
            <article className="who-card who-agents">
              <BrandImg name="03-ai-agents.png" art="agents" alt="A glass shopping bag holding a green coin, with paths leading into it." ratio="16 / 9" />
              <div className="who-body">
                <p className="who-k">AI shopping agents</p>
                <h3>Agents read your page the way screen readers do.</h3>
                <p>Our agent could not find a Pay button that was a <code>&lt;div&gt;</code>. After a one-line fix it bought in 18 steps, PayPal order <span className="mono">{ORDERS.agentFixed.id}</span>.</p>
                <a className="lp-link" href="#agents">How agents shop <Arrow /></a>
              </div>
            </article>
            <article className="who-card who-small">
              <p className="who-k">Merchants</p>
              <h3>Find the payments you lose before your customers do.</h3>
              <p>Get the fix as code, not a list of rule IDs, and proof from a PayPal-confirmed order. The European Accessibility Act has applied to online shops in the EU since {EAA_DATE}.</p>
              <a className="lp-link" href="#owner">What you get <Arrow /></a>
            </article>
            <article className="who-card who-small">
              <p className="who-k">PayPal</p>
              <h3>Every unblocked checkout is a payment that can reach PayPal.</h3>
              <p>A check that can sit next to the integration guide: run it before go-live and see which customers could not pay.</p>
              <a className="lp-link" href="#/paypal">For PayPal <Arrow /></a>
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
            <pre className="codeblock on-navy" aria-label="The one-line fix that let the agent pay"><span className="c-meta">The fix that unblocked the agent</span>{'\n'}<span className="del">- {PAY_FIX.before}</span>{'\n'}<span className="add">+ {PAY_FIX.after}</span></pre>
          </Reveal>
          <Reveal className="chat" role="group" aria-label="A recorded agentic buyer run">
            <div className="bubble user">Get me something that keeps me dry on hikes, under $100, and I need it fast.</div>
            <div className="bubble agent">Rain Jacket, $79.00, with express delivery. The backpack and the bottle do not keep you dry.</div>
            <div className="receipt-dark">
              <div><span>Total</span><b className="mono">$94.00</b></div>
              <div><span>PayPal order</span><b className="mono">{ORDERS.agentic.id}</b></div>
              <div><span>Status</span><b><span className="status-fill">COMPLETED</span></b></div>
              <div><span>Right item</span><b>Yes: rain jacket, express</b></div>
            </div>
            <a className="lp-link light" href={`#/runs/${RUNS.agentClean}`}>Replay the agent’s run <Arrow /></a>
          </Reveal>
        </div>
      </section>

      {/* 6. Method strip */}
      <section className="s-light sec" aria-labelledby="method-t">
        <div className="wrap">
          <SectionHead eyebrow="The method" id="method-t" title="Nine stages, from a scan to a paid order."
            lead="We measure the path, not just the rules: whether a simulated customer can finish, where it gets stuck, and how that changes after the fix." />
          <MethodStrip />
          <p className="more"><a className="lp-link" href="#/method">See every stage with its real artifact <Arrow /></a></p>
        </div>
      </section>

      {/* 7. Can they finish? */}
      <section className="s-white sec" aria-labelledby="jm-t">
        <div className="wrap">
          <SectionHead eyebrow="Can they finish?" id="jm-t" title="Where each customer stopped, and what changed after the fix."
            lead="Blocked to paid is not “faster”. It is impossible becoming possible. After the fix, the agent’s path was 18 steps, the same as on the shop without the defect." />
          <JourneyMap />
        </div>
      </section>

      {/* 8. PayPal confirms */}
      <section className="s-light sec" aria-labelledby="ppc-t">
        <div className="wrap">
          <SectionHead eyebrow="Proof of purchase, not proof of compliance" id="ppc-t" title="The test passes only when PayPal confirms the order." />
          <PayPalConfirms />
        </div>
      </section>

      {/* 9. Outputs for the owner */}
      <section className="s-white sec" id="owner" aria-labelledby="owner-t">
        <div className="wrap">
          <SectionHead eyebrow="What the owner gets" id="owner-t" title="Not a dashboard. A fix you can ship."
            lead="Four outputs from every test. The examples below come from the recorded runs." />
          <OwnerOutputs />
        </div>
      </section>

      {/* 10. Real open-source storefronts */}
      <section className="s-light sec" id="real-sites" aria-labelledby="real-t">
        <div className="wrap">
          <SectionHead eyebrow="Outside our demo shop" id="real-t" title="We sent the agent to the public demo stores of three open-source commerce platforms."
            lead="Shops are built from these templates, so a barrier in the template ships to every shop that copies it. The agent stops at the payment step: no order, no card data." />
          <RealSites />
          <p className="foot-note">axe-core counts are rule violations per page, summed. Most of them are colour contrast and landmark rules; what stopped or slowed the agent was mostly something else.</p>
        </div>
      </section>

      {/* 11. Business chain + calculator: navy */}
      <section className="s-navy sec" aria-labelledby="chain-t">
        <div className="wrap">
          <SectionHead eyebrow="For PayPal" id="chain-t" light title="From a fixed checkout to PayPal volume."
            lead="One link in this chain is measured by AccessiPay. The rest is your arithmetic, with your numbers.">
            <KindLegend />
          </SectionHead>
          <Chain />
          <Calculator />
        </div>
      </section>

      {/* 12. Ledger */}
      <section className="s-white sec" aria-labelledby="ledger-t">
        <div className="wrap">
          <SectionHead eyebrow="Results" id="ledger-t" title="Every run settles as a payment, or it doesn’t."
            lead="Recorded runs against the PayPal sandbox. Open any row to replay it step by step." />
          <Ledger meta={meta} />
        </div>
      </section>

      {/* 13. Honest limits */}
      <section className="s-light sec" aria-labelledby="limits-t">
        <div className="wrap limits">
          <SectionHead eyebrow="Honest limits" id="limits-t" title="What we do not claim." />
          <Reveal as="ul" className="limits-list" stagger>
            <li><b>Simulated customers.</b> Our screen reader and keyboard customers are models of how assistive technology exposes a page, not people with disabilities. They do not replace testing with disabled users.</li>
            <li><b>Not a certificate.</b> Not a WCAG audit and not proof of compliance.</li>
            <li><b>Our own defects.</b> The twelve demo-shop defects were written by us. That is why we also test public storefront demos.</li>
            <li><b>Steps, not seconds.</b> Run time is mostly the model thinking, so we never show it as a customer’s time.</li>
            <li><b>Sandbox only.</b> Every payment runs in the PayPal sandbox with test cards.</li>
          </Reveal>
          <p className="more"><a className="lp-link" href="#/honesty">Everything we measure and do not measure <Arrow /></a></p>
        </div>
      </section>

      {/* 14. Final CTA */}
      <section className="s-navy final" aria-labelledby="final-t">
        <div className="wrap">
          <LogoMark size={88} className="final-mark" />
          <h2 id="final-t">See your checkout through your customers.</h2>
          <div className="cta-row center">
            <a className="btn-lp primary" href="#/test">Run a test</a>
            <a className="btn-lp ghost-light" href="#/analytics">See the analytics</a>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
