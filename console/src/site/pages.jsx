import React, { useEffect, useState } from 'react';
import { BrandImg, Reveal } from './motion.jsx';
import { Arrow, SectionHead, PayPalConfirms, SiteFooter, JourneyMap } from './blocks.jsx';
import { Chain, Calculator, KindLegend } from './BusinessChain.jsx';
import { CUSTOMERS, METHOD, RUNS, ORDERS, PAY_FIX, EAA_DATE, REAL_SITES } from './facts.js';

function PageHero({ eyebrow, title, lead, img, art, alt, children }) {
  return (
    <section className="s-navy phero" aria-labelledby="ph-t">
      <div className="wrap phero-grid">
        <div>
          <p className="eyebrow-lp light">{eyebrow}</p>
          <h1 id="ph-t">{title}</h1>
          <p className="lead-lp light">{lead}</p>
          {children}
        </div>
        <BrandImg name={img} art={art} alt={alt} ratio="16 / 10" eager className="phero-img" />
      </div>
    </section>
  );
}

function Artifact({ a }) {
  if (a.kind === 'quote') return <blockquote className="art-quote">{a.text}</blockquote>;
  if (a.kind === 'stat') return <div className="art-stat"><b>{a.value}</b><span>{a.label}</span></div>;
  if (a.kind === 'rail') {
    return (
      <ol className="art-rail" aria-label="Checkout stages; this run stopped at Payment">
        {a.stages.map((s, i) => <li key={s} className={i < a.stop ? 'done' : i === a.stop ? 'stop' : ''}>{s}{i === a.stop && <span className="sr-only"> (stopped here)</span>}</li>)}
      </ol>
    );
  }
  if (a.kind === 'diff') return <pre className="codeblock"><span className="del">- {PAY_FIX.before}</span>{'\n'}<span className="add">+ {PAY_FIX.after}</span></pre>;
  if (a.kind === 'receipt') {
    return (
      <dl className="art-receipt">
        <div><dt>PayPal</dt><dd>Payment confirmed</dd></div>
        <div><dt>Amount</dt><dd className="mono">$54.00</dd></div>
        <div><dt>Status</dt><dd><span className="status-fill">COMPLETED</span></dd></div>
      </dl>
    );
  }
  if (a.kind === 'list') return <ul className="art-list">{a.items.map((x) => <li key={x}>{x}</li>)}</ul>;
  return null;
}

// M9: sticky stage index on the left, the active stage follows the scroll (IntersectionObserver).
export function MethodPage() {
  const [active, setActive] = useState(1);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(Number(vis[0].target.dataset.n));
    }, { rootMargin: '-30% 0px -55% 0px' });
    document.querySelectorAll('.stage[data-n]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <div className="lp">
      <PageHero eyebrow="Method" title="Nine stages. Each one leaves a real artifact." img="06-method.png" art="method"
        alt="A relief map with a green dotted path climbing to a marker."
        lead="From reading the shop to handing the owner a fix. Every example below comes from the recorded run pair: the AI agent blocked by a <div> Pay button, then paying after the AI fix." />
      <section className="s-light sec" aria-label="The nine stages">
        <div className="wrap method">
          <nav className="m-index" aria-label="Stages">
            <ol>
              {METHOD.map((m) => (
                <li key={m.n}><a href={`#stage-${m.n}`} className={active === m.n ? 'on' : ''} aria-current={active === m.n ? 'step' : undefined}><span>{String(m.n).padStart(2, '0')}</span>{m.title}</a></li>
              ))}
            </ol>
          </nav>
          <div className="m-stages">
            {METHOD.map((m) => (
              <article key={m.n} id={`stage-${m.n}`} data-n={m.n} className="stage">
                <p className="stage-n">Stage {m.n}</p>
                <h2>{m.title}</h2>
                <p className="stage-detail">{m.detail}</p>
                <Artifact a={m.artifact} />
                <a className="lp-link" href={`#/runs/${m.run}`}>Open the run this comes from <Arrow /></a>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="s-white sec" aria-labelledby="m-jm">
        <div className="wrap">
          <SectionHead eyebrow="Stages 6 to 8 together" id="m-jm" title="Can each customer finish, before and after?" />
          <JourneyMap />
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

export function CustomersPage() {
  return (
    <div className="lp">
      <PageHero eyebrow="Customers" title="Three simulated customers. The people they stand for." img="08-cover.png" art="cover"
        alt=""
        lead="Each customer perceives the page its own way and acts only through the keyboard or the accessibility tree. They are models, not people, and we say exactly what each one can and cannot tell you." />
      {CUSTOMERS.map((c, i) => (
        <section key={c.key} className={`${i % 2 ? 's-white' : 's-light'} sec`} aria-labelledby={`c-${c.key}`}>
          <div className={`wrap cust ${i % 2 ? 'flip' : ''}`}>
            <Reveal className="cust-img"><BrandImg name={c.img} art={c.art} alt={c.alt} ratio="4 / 3" /></Reveal>
            <Reveal className="cust-body">
              <p className="eyebrow-lp">Simulated customer {i + 1} of 3</p>
              <h2 id={`c-${c.key}`}>{c.name}</h2>
              <p className="lead-lp">{c.standsFor}</p>
              <dl className="cust-dl">
                <div><dt>Perceives</dt><dd>{c.perceives}</dd></div>
                <div><dt>Can do</dt><dd>{c.acts}</dd></div>
                <div><dt>What a run tells you</dt><dd>{c.canClaim}</dd></div>
                <div><dt>What it cannot tell you</dt><dd>{c.cannotClaim}</dd></div>
              </dl>
              <p className="cust-proof">
                <span className="dot-word ok">Recorded</span> {c.proof.text}; PayPal confirmed the payment.{' '}
                <a href={`#/runs/${c.proof.run}`}>Replay<span className="sr-only"> the {c.name.toLowerCase()} run</span></a>
              </p>
            </Reveal>
          </div>
        </section>
      ))}
      <section className="s-navy sec" aria-labelledby="c-merchant">
        <div className="wrap cust">
          <Reveal className="cust-img"><BrandImg name="04-merchants.png" art="merchants" alt="Parcels on a shop counter beside a card terminal and a receipt." ratio="4 / 3" /></Reveal>
          <Reveal className="cust-body">
            <p className="eyebrow-lp light">And the customer who runs the test</p>
            <h2 id="c-merchant">The merchant</h2>
            <p className="lead-lp light">Run it before go-live. See which customers could not pay, get the patch, and get a PayPal-confirmed order as proof that it works. The European Accessibility Act has applied to online shops in the EU since {EAA_DATE}.</p>
            <div className="cta-row"><a className="btn-lp primary" href="#/test">Run a test</a></div>
          </Reveal>
        </div>
      </section>
      <section className="s-white sec" aria-labelledby="c-next">
        <div className="wrap">
          <SectionHead eyebrow="Not built yet" id="c-next" title="Customer types we plan to add." />
          <Reveal className="planned" stagger>
            <article><h3>Voice control</h3><p>Says the visible label of a control. Catches icon-only buttons and names that differ from the visible label (WCAG 2.5.3).</p></article>
            <article><h3>Low vision at 400% zoom</h3><p>A 320 px wide viewport. Catches clipped content and popups whose Close button is off-screen (WCAG 1.4.10).</p></article>
            <article><h3>Visible focus</h3><p>A keyboard customer who is not told where focus is when the outline is invisible (WCAG 2.4.7).</p></article>
          </Reveal>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

const PP_POINTS = [
  { t: 'More completed payments', b: 'Every checkout a customer can finish is a payment that can reach PayPal. AccessiPay finds the ones that cannot and fixes them.' },
  { t: 'Merchants ready for agentic commerce', b: 'AI agents read pages through the accessibility tree. The fixes that let screen reader users pay also let agents complete PayPal checkouts.' },
  { t: `The law, since ${EAA_DATE}`, b: 'The European Accessibility Act applies to online shops in the EU. Merchants have a reason to test their checkout now.' },
  { t: 'A check next to the integration guide', b: 'Run before go-live: see which customers could not pay. Success is a COMPLETED PayPal order, not a compliance score.' },
  { t: 'A channel to merchants', b: 'An idea, not a partnership: a payment provider could offer this check to its merchants, for example in onboarding. The merchant opts in, verifies the site and lets the checker through its own bot protection, the same steps as on our “Test your own site” page.' },
  { t: 'Open to AI assistants?', b: 'Many large shops turn automated browsers away. The same wall can stop an AI assistant that shops for a person. The agent access check shows a merchant where it stands.' },
];

export function PayPalPage() {
  return (
    <div className="lp">
      <PageHero eyebrow="For PayPal" title="The test passes only when PayPal confirms the order." img="05-business-chain.png" art="chain" alt=""
        lead="Proof of purchase, not proof of compliance. PayPal is the confirmation that a customer or an agent really completed a purchase." />
      <section className="s-light sec" aria-labelledby="pp-role">
        <div className="wrap">
          <SectionHead eyebrow="PayPal’s role" id="pp-role" title="Without PayPal, the product has no ground truth." />
          <PayPalConfirms />
        </div>
      </section>
      <section className="s-white sec" aria-labelledby="pp-why">
        <div className="wrap">
          <SectionHead eyebrow="What this gives PayPal" id="pp-why" title="Four reasons this belongs next to a PayPal integration." />
          <Reveal className="pp-points" stagger>
            {PP_POINTS.map((p, i) => (
              <article key={p.t}><span className="pp-n">{String(i + 1).padStart(2, '0')}</span><h3>{p.t}</h3><p>{p.b}</p></article>
            ))}
          </Reveal>
        </div>
      </section>
      <section className="s-navy sec" aria-labelledby="pp-chain">
        <div className="wrap">
          <SectionHead eyebrow="The business chain" id="pp-chain" light title="From a fixed checkout to PayPal volume."
            lead="Only the second link is measured by AccessiPay. Everything after it is arithmetic on numbers the merchant types.">
            <KindLegend />
          </SectionHead>
          <Chain />
          <Calculator />
        </div>
      </section>
      <section className="s-light sec" aria-labelledby="pp-int">
        <div className="wrap">
          <SectionHead eyebrow="How PayPal is used today" id="pp-int" title="Orders v2 in the PayPal sandbox."
            lead="The demo shop creates and captures each order through PayPal Orders v2, then reads it back. A run counts only when that read-back says COMPLETED and the right item was bought." />
          <Reveal className="pp-orders" stagger>
            <div><b>Confirmed by PayPal</b><span>Screen reader customer, clean shop, $54.00</span></div>
            <div><b>Confirmed by PayPal</b><span>Keyboard-only customer, after the fix, $54.00</span></div>
            <div><b>Confirmed by PayPal</b><span>AI agent, after the fix, $54.00</span></div>
            <div><b>Confirmed by PayPal</b><span>Agentic buyer, Rain Jacket with express delivery, $94.00</span></div>
          </Reveal>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

export function HonestyPage() {
  return (
    <div className="lp">
      <section className="s-navy phero slim" aria-labelledby="ph-t">
        <div className="wrap">
          <p className="eyebrow-lp light">Honesty</p>
          <h1 id="ph-t">What we measure, and what we do not.</h1>
          <p className="lead-lp light">Every number on this site comes from a recorded run, and every run can be replayed step by step. This page lists the limits.</p>
        </div>
      </section>
      <section className="s-light sec">
        <div className="wrap honesty">
          <Reveal as="article" className="h-card">
            <h2>The customers are simulated</h2>
            <p>AccessiPay simulates customers with AI models. Our screen reader and keyboard customers are models of how assistive technology exposes a page, not people with disabilities, and they do not replace testing with disabled users.</p>
            <ul>
              <li>The keyboard customer is told where focus is, even when a sighted person could not see the outline. It cannot detect an invisible focus indicator yet.</li>
              <li>The screen reader customer gets the whole accessibility tree at once and does not hear live announcements, so its step counts are a lower bound.</li>
              <li>The AI agent acts by role and name. Agents that click by screenshot coordinates might behave differently.</li>
            </ul>
          </Reveal>
          <Reveal as="article" className="h-card">
            <h2>How the numbers are produced</h2>
            <ul>
              <li>Outcome: “Paid” only when PayPal Orders v2 reports the sandbox order COMPLETED and the right item was bought.</li>
              <li>Effort is counted in steps. We never show run time as a customer’s time: most of it is the model thinking between steps.</li>
              <li>Blocked to paid is “impossible to possible”, not “faster”.</li>
              <li>Some cases were repeated: before the fix, the keyboard customer gave up after 15, 18 and 20 steps, and the agent on the <code>&lt;div&gt;</code> shop after 20, 21 and 22 steps. Most results are still single runs.</li>
              <li>In the recorded runs, each step was decided by a Claude model through the engine’s agent interface.</li>
            </ul>
          </Reveal>
          <Reveal as="article" className="h-card">
            <h2>The demo shop</h2>
            <ul>
              <li>The twelve checkout defects were written by us. A holdout set was kept out of prompt tuning.</li>
              <li>axe-core (default rules) flags 2 of the 12. That number is about our defects, not about the web in general.</li>
              <li>All payments run in the PayPal sandbox with test cards. No real money moves.</li>
            </ul>
          </Reveal>
          <Reveal as="article" className="h-card">
            <h2>The public storefront demos</h2>
            <ul>
              <li>These are the official demo stores of three open-source platforms, not shops with real customers.</li>
              <li>The agent stops at the payment step. It never places an order and never types card data. Details are made up.</li>
              {REAL_SITES.map((s) => <li key={s.platform}><b>{s.platform}:</b> {s.reached} {s.tone === 'config' ? 'This is a demo setting and is not counted as a barrier.' : ''}</li>)}
              <li>On Medusa, axe-core did flag the unnamed checkout fields (rules <code>label</code> and <code>select-name</code>). We do not say the scanner missed them.</li>
              <li>Sites change. Each finding is from a run on 30 October 2026 and can be replayed.</li>
            </ul>
          </Reveal>
          <Reveal as="article" className="h-card">
            <h2>What we never claim</h2>
            <ul>
              <li>Not a WCAG audit, certificate or proof of compliance.</li>
              <li>No percentages of “people with disabilities who can now shop”.</li>
              <li>No market statistics. The calculator on the PayPal page starts empty and says “not a forecast”.</li>
            </ul>
          </Reveal>
        </div>
        <div className="wrap"><p className="more">Every claim on this site links to a run you can replay. <a className="lp-link" href="#/runs">Browse all runs <Arrow /></a></p></div>
      </section>
      <SiteFooter />
    </div>
  );
}
