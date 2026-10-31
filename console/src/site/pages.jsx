import React, { useEffect, useState } from 'react';
import { BrandImg, Reveal } from './motion.jsx';
import { Arrow, SectionHead, PayPalConfirms, JourneyMap } from './blocks.jsx';
import { Chain, Calculator, KindLegend } from './BusinessChain.jsx';
import { CUSTOMERS, METHOD, RUNS, ORDERS, PAY_FIX, EAA_DATE, DEMO_DEFECTS, AXE_FLAGGED, HOLDOUT_DEFECTS, REPEATS, lower } from './facts.js';

// Keep hyphenated words ("keyboard-only", "axe-core"), "WCAG 2.5.3" and "320 px" on one line.
const NOWRAP = /([A-Za-z]+(?:-[A-Za-z]+)+|WCAG\s[\d.]+|\d+\spx)/g;
function nb(text) {
  if (typeof text !== 'string') return text;
  return text.split(NOWRAP).map((part, i) => (i % 2 ? <span key={i} className="nw">{part}</span> : part));
}

function PageHero({ eyebrow, title, lead, img, art, alt, visual }) {
  return (
    <section className="s-navy phero" aria-labelledby="ph-t">
      <div className="wrap phero-grid">
        <div>
          <p className="eyebrow-lp light">{eyebrow}</p>
          <h1 id="ph-t">{title}</h1>
          <p className="lead-lp light">{lead}</p>
        </div>
        {visual || <BrandImg name={img} art={art} alt={alt} ratio="16 / 10" eager className="phero-img" />}
      </div>
    </section>
  );
}

// One label set for run outcomes on every brand page: Paid / Blocked.
function Outcome({ paid, run, who, children }) {
  return (
    <p className={`outcome ${paid ? 'ok' : 'bad'}`}>
      <span className="dot-word">{paid ? 'Paid' : 'Blocked'}</span>
      <span className="outcome-t">{nb(children)}.</span>
      <a className="outcome-a" href={`#/runs/${run}`}>Replay<span className="sr-only"> the {who} run</span></a>
    </p>
  );
}

function Artifact({ a }) {
  if (a.kind === 'quote') return <blockquote className="art-quote">{a.text}</blockquote>;
  if (a.kind === 'stat') return <div className="art-stat"><b>{a.value}</b><span>{nb(a.label)}</span></div>;
  if (a.kind === 'rail') {
    return (
      <ol className="art-rail" aria-label="Checkout stages; this run stopped at Payment">
        {a.stages.map((s, i) => <li key={s} className={i < a.stop ? 'done' : i === a.stop ? 'stop' : ''}>{s}{i === a.stop && <span className="sr-only"> (stopped here)</span>}</li>)}
      </ol>
    );
  }
  if (a.kind === 'diff') return <pre className="codeblock" tabIndex={0} aria-label="The fix"><span className="del">- {PAY_FIX.before}</span>{'\n'}<span className="add">+ {PAY_FIX.after}</span></pre>;
  if (a.kind === 'receipt') {
    return (
      <dl className="art-receipt">
        <div><dt>PayPal</dt><dd>Payment confirmed</dd></div>
        <div><dt>Amount</dt><dd className="mono">${ORDERS.agentFixed.amount.toFixed(2)}</dd></div>
        <div><dt>Status</dt><dd><span className="status-fill">COMPLETED</span></dd></div>
      </dl>
    );
  }
  if (a.kind === 'list') return <ul className="art-list">{a.items.map((x) => <li key={x}>{nb(x)}</li>)}</ul>;
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
    <div className="lp lp-brand">
      <PageHero eyebrow="Method" title="Nine stages, each shown on a recorded run" visual={<StageIndexCard />}
        lead="From reading the shop to handing the owner a fix. Most examples below come from one pair of recorded runs: the AI shopping agent stopped by a Pay button that isn’t a real button, then paying after the AI fix." />
      <section className="s-light sec" aria-label="The nine stages">
        <div className="wrap method">
          <nav className="m-index" aria-label="Stages">
            <ol>
              {METHOD.map((m) => (
                <li key={m.n}><a href={`#stage-${m.n}`} className={active === m.n ? 'on' : ''} aria-current={active === m.n ? 'step' : undefined}><span>{String(m.n).padStart(2, '0')}</span><em>{m.title}</em></a></li>
              ))}
            </ol>
          </nav>
          <div className="m-stages">
            {METHOD.map((m) => (
              <article key={m.n} id={`stage-${m.n}`} data-n={m.n} className="stage">
                <p className="stage-n">Stage {m.n}</p>
                <h2>{m.title}</h2>
                <p className="stage-detail">{nb(m.detail)}</p>
                <Artifact a={m.artifact} />
                <a className="lp-link stage-link" href={`#/runs/${m.run}`}>Replay the run <Arrow /></a>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="s-white sec" aria-labelledby="m-jm">
        <div className="wrap">
          <SectionHead eyebrow="Before and after" id="m-jm" title="Can each customer finish, before and after the AI fix?" />
          <JourneyMap />
        </div>
      </section>
      <Limits />
    </div>
  );
}

// Hero cards: real content instead of decorative motion.
function StageIndexCard() {
  return (
    <nav className="phero-panel hero-stages" aria-label="The nine stages">
      <ol>
        {METHOD.map((m) => (
          <li key={m.n} className={m.n === 4 ? 'key' : ''}>
            <a href={`#stage-${m.n}`}><span>{String(m.n).padStart(2, '0')}</span>{m.title}{m.n === 4 && <i>PayPal confirms</i>}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function CustomerCards() {
  return (
    <ul className="phero-panel hero-custs">
      {CUSTOMERS.map((c) => {
        const paid = c.proof.find((p) => p.paid);
        const blocked = c.proof.find((p) => !p.paid);
        return (
          <li key={c.key}>
            <a href={`#c-${c.key}`}><b>{nb(c.name)}</b></a>
            <span className="hc-line">{c.line}</span>
            <span className="hc-out">
              {blocked && <><span className="dot-word bad">Blocked</span><span aria-hidden="true" className="hc-arr">→</span></>}
              <span className="dot-word ok">Paid</span>
              <a href={`#/runs/${paid.run}`}>Replay<span className="sr-only"> the {lower(c.name)} run</span></a>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ProofCard() {
  return (
    <div className="phero-panel pp-proof">
      <p className="hp-k">PayPal Orders v2 · sandbox</p>
      <p className="hp-t">PayPal says COMPLETED</p>
      <dl>
        <div><dt>Customer</dt><dd>AI shopping agent, after the AI fix</dd></div>
        <div><dt>Steps</dt><dd className="tnum">{ORDERS.agentFixed.steps}</dd></div>
        <div><dt>Amount</dt><dd className="mono">${ORDERS.agentFixed.amount.toFixed(2)}</dd></div>
        <div><dt>Status</dt><dd><span className="status-fill">COMPLETED</span></dd></div>
      </dl>
      <a className="lp-link" href={`#/runs/${RUNS.agentFixed}`}>Replay the run <Arrow /></a>
    </div>
  );
}

export function CustomersPage() {
  return (
    <div className="lp lp-brand">
      <PageHero eyebrow="Customers" title="Three simulated customers, and the people they stand for" visual={<CustomerCards />}
        lead="Each customer perceives the page its own way and acts only through the keyboard or the accessibility tree. They are models, not people, and we say exactly what each one can and cannot tell you." />
      {CUSTOMERS.map((c, i) => (
        <section key={c.key} className={`${i % 2 ? 's-white' : 's-light'} sec`} aria-labelledby={`c-${c.key}`}>
          <div className={`wrap cust ${i % 2 ? 'flip' : ''}`}>
            <Reveal className="cust-img"><BrandImg name={c.img} art={c.art} alt={c.alt} ratio="4 / 3" /></Reveal>
            <Reveal className="cust-body">
              <p className="eyebrow-lp">Simulated customer {i + 1} of 3</p>
              <h2 id={`c-${c.key}`}>{nb(c.name)}</h2>
              <p className="lead-lp">{c.standsFor}</p>
              <dl className="cust-dl">
                <div><dt>Perceives</dt><dd>{c.perceives}</dd></div>
                <div><dt>Can do</dt><dd>{c.acts}</dd></div>
                <div><dt>What a run tells you</dt><dd>{nb(c.canClaim)}</dd></div>
                <div><dt>What it cannot tell you</dt><dd>{c.cannotClaim}</dd></div>
              </dl>
              <div className="cust-proof">
                {c.proof.map((p) => <Outcome key={p.run} paid={p.paid} run={p.run} who={lower(c.name)}>{p.text}</Outcome>)}
              </div>
            </Reveal>
          </div>
        </section>
      ))}
      <section className="s-navy cta-band" aria-label="Test your own checkout">
        <div className="wrap cta-band-row">
          <p>Want to know how your own checkout does with these three customers?</p>
          <a className="btn-lp primary" href="#/own-site">Connect your site</a>
        </div>
      </section>
      <section className="s-white sec" aria-labelledby="c-next">
        <div className="wrap">
          <SectionHead eyebrow="Not built yet" id="c-next" title="Customer types we plan to add" />
          <Reveal className="planned" stagger>
            <article><h3>Voice control</h3><p>{nb('Says the visible label of a control. Catches icon-only buttons and names that differ from the visible label (WCAG 2.5.3).')}</p></article>
            <article><h3>Low vision at 400% zoom</h3><p>{nb('A 320 px wide viewport. Catches clipped content and popups whose Close button is off-screen (WCAG 1.4.10).')}</p></article>
            <article><h3>Visible focus</h3><p>{nb('A keyboard customer who is not told where focus is when the outline is invisible (WCAG 2.4.7).')}</p></article>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

const PP_POINTS = [
  { t: 'More completed payments', b: 'Every checkout a customer can finish is a payment that can reach PayPal. AccessiPay finds the ones that cannot and fixes them.' },
  { t: 'Merchants ready for agentic commerce', b: 'AI agents read pages through the accessibility tree. The fixes that let screen reader users pay also let agents complete PayPal checkouts.' },
  { t: `The law, since ${EAA_DATE}`, b: 'The European Accessibility Act applies to online shops in the EU. Merchants have a reason to test their checkout now.' },
  { t: 'A check next to the integration guide', b: 'Run it before go-live and see which customers could not pay. Success is a COMPLETED PayPal order, not a compliance score.' },
];

// Orders PayPal confirmed in the sandbox, each with its run.
const PP_ORDERS = [
  { who: 'Screen reader customer', run: RUNS.screenReader, text: `Clean shop, ${ORDERS.screenReader.steps} steps`, amount: ORDERS.screenReader.amount },
  { who: 'Keyboard-only customer', run: RUNS.keyboardFixed, text: `After the AI fix (${ORDERS.keyboardFixed.patches} changes), ${ORDERS.keyboardFixed.steps} steps`, amount: ORDERS.keyboardFixed.amount },
  { who: 'AI shopping agent', run: RUNS.agentFixed, text: `After the AI fix (${ORDERS.agentFixed.patches} changes), ${ORDERS.agentFixed.steps} steps`, amount: ORDERS.agentFixed.amount },
  { who: 'AI shopping agent', run: RUNS.agentClean, text: `${ORDERS.agentic.item} with ${ORDERS.agentic.delivery} delivery, ${ORDERS.agentic.steps} steps`, amount: ORDERS.agentic.amount },
];

export function PayPalPage() {
  return (
    <div className="lp lp-brand">
      <PageHero eyebrow="For PayPal" title="The test passes only when PayPal confirms the order" visual={<ProofCard />}
        lead="Proof of purchase, not proof of compliance. In our demo shop, every pass is an order the PayPal sandbox confirmed. On real shops nobody pays: the customer stops at the payment step." />
      <section className="s-light sec" aria-labelledby="pp-role">
        <div className="wrap">
          <SectionHead eyebrow="PayPal’s role" id="pp-role" title="Without PayPal, a pass would be only the customer’s word" />
          <PayPalConfirms />
          <h3 className="pp-orders-h">Orders PayPal confirmed (Orders v2, sandbox)</h3>
          <Reveal as="ul" className="pp-orders" stagger>
            {PP_ORDERS.map((o) => (
              <li key={o.run}>
                <b>{nb(o.who)}</b>
                <span className="dot-word">Paid</span>
                <span className="pp-o-t">{nb(o.text)} · <span className="mono">${o.amount.toFixed(2)}</span></span>
                <a href={`#/runs/${o.run}`}>Replay<span className="sr-only"> the {lower(o.who)} run</span></a>
              </li>
            ))}
          </Reveal>
        </div>
      </section>
      <section className="s-white sec" aria-labelledby="pp-why">
        <div className="wrap">
          <SectionHead eyebrow="What this gives PayPal" id="pp-why" title="Four reasons this belongs next to a PayPal integration" />
          <Reveal className="pp-points" stagger>
            {PP_POINTS.map((p, i) => (
              <article key={p.t}><span className="pp-n">{String(i + 1).padStart(2, '0')}</span><h3>{p.t}</h3><p>{p.b}</p></article>
            ))}
          </Reveal>
        </div>
      </section>
      <section className="s-navy sec" id="calculator" aria-labelledby="pp-chain">
        <div className="wrap">
          <SectionHead eyebrow="The business chain" id="pp-chain" light title="From a fixed checkout to PayPal volume"
            lead="The second link comes from recorded runs. Everything after it is the merchant’s own numbers and arithmetic on them.">
            <KindLegend />
          </SectionHead>
          <Chain />
          <Calculator />
        </div>
      </section>
    </div>
  );
}

// What we measure and what we do not: the last section of the Method page.
export function Limits() {
  return (
    <section className="s-light sec" id="limits" aria-labelledby="limits-h">
      <div className="wrap">
        <SectionHead eyebrow="Limits" id="limits-h" title="What we measure, and what we do not" />
      </div>
      <div className="wrap honesty">
        <Reveal as="article" className="h-card">
          <h3>The customers are simulated</h3>
          <p>AccessiPay simulates customers with AI models. Our screen reader and keyboard customers are models of how assistive technology exposes a page, not people with disabilities, and they do not replace testing with disabled users.</p>
          <ul>
            <li>The keyboard customer is told where focus is, even when a sighted person could not see the outline. It cannot detect an invisible focus indicator yet.</li>
            <li>The screen reader customer gets the whole accessibility tree at once and does not hear live announcements, so a person would likely need more steps.</li>
            <li>The AI shopping agent acts by role and name. Agents that click by screenshot coordinates might behave differently.</li>
          </ul>
        </Reveal>
        <Reveal as="article" className="h-card">
          <h3>How the numbers are produced</h3>
          <ul>
            <li>Outcome: “Paid” only when PayPal (Orders v2, sandbox) reports the order COMPLETED and the right item was bought.</li>
            <li>Effort is counted in steps. We never show run time as a customer’s time: most of it is the model thinking between steps.</li>
            <li>Blocked to paid is “impossible to possible”, not “faster”.</li>
            <li>{nb(`Some cases were repeated: before the fix, the keyboard-only customer gave up after ${REPEATS.keyboard.join(', ').replace(/, (\d+)$/, ' and $1')} steps, and the AI shopping agent facing the Pay button that isn’t a real button after ${REPEATS.agent.join(', ').replace(/, (\d+)$/, ' and $1')} steps. Most results are still single runs.`)}</li>
            <li>In the recorded runs, a Claude model decided each step.</li>
          </ul>
        </Reveal>
        <Reveal as="article" className="h-card">
          <h3>The demo shop</h3>
          <ul>
            <li>We wrote its {DEMO_DEFECTS} checkout defects ourselves. Of those, {HOLDOUT_DEFECTS} were kept aside and never used while we wrote the customers’ instructions.</li>
            <li>{nb(`Across all ${DEMO_DEFECTS} demo defects, axe-core (default rules) flags ${AXE_FLAGGED}. That number is about our defects, not about the web in general.`)}</li>
            <li>All payments run in the PayPal sandbox with test cards. No real money moves.</li>
          </ul>
        </Reveal>
        <Reveal as="article" className="h-card">
          <h3>Real shops</h3>
          <ul>
            <li>Every shop is tested by all three customers. They stop at the payment step: no order is placed, no card data is typed, the details are made up.</li>
            <li>Real shops are published without their names, addresses or screenshots, and each is visited at most once a day.</li>
            <li>A shop that turns our browser away is listed as such; AccessiPay never gets past bot protection.</li>
            <li>Every finding is checked again without AI against the record of its run; each one shows whether the record confirms it.</li>
          </ul>
        </Reveal>
        <Reveal as="article" className="h-card h-wide">
          <h3>What we never claim</h3>
          <ul>
            <li>Not a WCAG audit, certificate or proof of compliance.</li>
            <li>No percentages of “people with disabilities who can now shop”.</li>
            <li>No market statistics. The calculator on <a href="#/paypal">For PayPal</a> starts empty and says “not a forecast”.</li>
          </ul>
        </Reveal>
      </div>
      <div className="wrap"><p className="more">Every claim on this site links to a run you can replay. <a className="lp-link" href="#/results">See the results <Arrow /></a></p></div>
    </section>
  );
}
