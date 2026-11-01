import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Logo, { LogoMark } from '../Logo.jsx';
import { RUNS, ORDERS, PAY_FIX, SKIP_FIX, REPORT_HREF, METHOD, lower } from './facts.js';
import { useInView, useReducedMotion, Reveal } from './motion.jsx';

export function SectionHead({ eyebrow, title, id, lead, light = false, center = false, children }) {
  return (
    <Reveal className={`sh${center ? ' center' : ''}`}>
      {eyebrow && <p className={`eyebrow-lp${light ? ' light' : ''}`}>{eyebrow}</p>}
      <h2 id={id}>{title}</h2>
      {lead && <p className={`lead-lp${light ? ' light' : ''}`}>{lead}</p>}
      {children}
    </Reveal>
  );
}

export function Arrow() { return <span aria-hidden="true" className="arr">→</span>; }

// M4: the keyboard transcript plays line by line when it scrolls into view.
// Steps 6 to 15 of run cea700, shortened.
const TRAP_LINES = [
  ['Shift+Tab', 'Focus moved to: link “Cart (1)”'],
  ['Enter', 'Opened the cart. A promo popup takes focus.'],
  ['Escape', 'Nothing happens.'],
  ['Shift+Tab', 'Focus moved to: button “Subscribe”'],
  ['Shift+Tab', 'Focus moved to: email field “Email”'],
  ['Tab', 'Focus moved to: button “Subscribe”'],
  ['Escape', 'Nothing happens.'],
  ['Give up', 'Checkout is unreachable from the keyboard.'],
];

export function TwoVerdicts() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.4 });
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? TRAP_LINES.length : 0);
  useEffect(() => {
    if (reduced) { setN(TRAP_LINES.length); return undefined; }
    if (!inView || n >= TRAP_LINES.length) return undefined;
    const t = setTimeout(() => setN((x) => x + 1), n === 0 ? 200 : 450);
    return () => clearTimeout(t);
  }, [inView, n, reduced]);
  const done = n >= TRAP_LINES.length;
  return (
    <div className="verdicts" ref={ref}>
      <article className="vd vd-scan">
        <header><span className="vd-tag">Scanner report</span><span className="dot-chip ok">Passed</span></header>
        <p className="vd-big">0 violations</p>
        <ul className="vd-rules">
          {['Buttons have accessible names', 'Form fields have labels', 'Color contrast meets AA', 'Page has a language and landmarks'].map((r) => (
            <li key={r}><span>{r}</span><b>Pass</b></li>
          ))}
        </ul>
        <p className="vd-note">axe-core, default rules, on every page of the checkout.</p>
      </article>
      <span className="vd-vs" aria-hidden="true">vs</span>
      <article className="vd vd-tx">
        <header><span className="vd-tag">Keyboard-only customer · simulated</span><span className={`dot-chip bad ${done ? 'show' : 'wait'}`}>Could not pay</span></header>
        <ol>
          {TRAP_LINES.map(([key, text], i) => (
            <li key={i} className={`${i < n ? 'in' : ''}${i === n - 1 ? ' press' : ''}${i === TRAP_LINES.length - 1 ? ' last' : ''}`}>
              <kbd>{key}</kbd><span>{text}</span>
            </li>
          ))}
        </ol>
        <a className="lp-link" href={`#/runs/${RUNS.keyboardBlocked}`}>Open the full run, step by step <Arrow /></a>
      </article>
    </div>
  );
}

// M5: one lane per customer; the line stops where the customer stopped. Toggle redraws after the AI fix.
const LANES = [
  {
    name: 'Screen reader customer', shop: 'Clean shop',
    before: { stop: 4, paid: true, text: 'Paid in 36 steps', run: RUNS.screenReader },
    after: { stop: 4, paid: true, text: 'Paid in 36 steps (no fix needed)', run: RUNS.screenReader },
  },
  {
    name: 'Keyboard-only customer', shop: 'Popup that traps focus',
    before: { stop: 1, text: 'Blocked at Cart: the promo popup traps focus and Escape does nothing', run: RUNS.keyboardBlocked },
    after: { stop: 4, paid: true, text: 'Paid in 49 steps after the AI fix (7 changes)', run: RUNS.keyboardFixed },
  },
  {
    name: 'AI shopping agent', shop: 'A Pay button that is not a real button',
    before: { stop: 3, text: 'Blocked at Payment: no Pay button in the accessibility tree', run: RUNS.agentBlocked },
    after: { stop: 4, paid: true, text: 'Paid in 19 steps after the AI fix (5 changes)', run: RUNS.agentFixed },
  },
];
const STAGES = ['Browse', 'Cart', 'Checkout', 'Payment', 'Paid'];

export function JourneyMap() {
  const [after, setAfter] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.3 });
  return (
    <div className={`jm ${inView ? 'in' : ''}`} ref={ref}>
      <div className="seg" role="group" aria-label="Show results">
        <button type="button" aria-pressed={!after} onClick={() => setAfter(false)}>Before the fix</button>
        <button type="button" aria-pressed={after} onClick={() => setAfter(true)}>After the AI fix</button>
      </div>
      <div className="jm-axis" aria-hidden="true"><div>{STAGES.map((s, k) => <span key={s} style={{ left: `${k * 25}%` }}>{s}</span>)}</div></div>
      <ul className="jm-lanes">
        {LANES.map((l, li) => {
          const r = after ? l.after : l.before;
          return (
            <li key={l.name} className="jm-lane" style={{ '--d': `${li * 150}ms` }}>
              <div className="jm-who">
                <strong>{l.name}</strong>
                <span>{l.shop} · <span className="nw">axe{'\u2011'}core: 0{'\u00a0'}violations</span></span>
              </div>
              <div className="jm-track" aria-hidden="true">
                <span className="jm-rail" />
                <span className={`jm-fill ${r.paid ? 'paid' : 'bad'}`} style={{ '--to': r.stop / 4 }} />
                {STAGES.map((s, k) => (
                  <span key={s} className={`jm-node ${k < r.stop || (k === r.stop && r.paid) ? 'hit' : ''} ${k === r.stop ? (r.paid ? 'end-ok' : 'end-bad') : ''}`} style={{ left: `${k * 25}%` }} />
                ))}
              </div>
              <p className={`jm-out ${r.paid ? 'ok' : 'bad'}`}>
                <span className="dot-word" aria-hidden="true" />{r.text}{r.paid && '; PayPal confirmed the payment'}.{' '}
                <a href={`#/runs/${r.run}`}>Replay<span className="sr-only"> the {lower(l.name)} run</span></a>
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PayPalConfirms() {
  return (
    <div className="ppc">
      <Reveal className="ppc-flow" stagger>
        <div className="ppc-node">
          <span className="ppc-k">1</span>
          <h3>The customer finishes checkout</h3>
          <p>Screen reader, keyboard-only or AI agent: it has to press a real Pay button.</p>
        </div>
        <div className="ppc-node">
          <span className="ppc-k">2</span>
          <h3>We ask PayPal</h3>
          <p className="mono ppc-code">GET /v2/checkout/orders/{'{id}'}</p>
          <p>Orders v2, sandbox. The customer’s own claim of “done” is ignored.</p>
        </div>
        <div className="ppc-node ppc-receipt">
          <span className="ppc-k">3</span>
          <h3>PayPal says COMPLETED</h3>
          <dl>
            <div><dt>Amount</dt><dd className="mono">$54.00</dd></div>
            <div><dt>Status</dt><dd><span className="status-fill">COMPLETED</span></dd></div>
          </dl>
        </div>
      </Reveal>
      <Reveal className="ppc-copy">
        <p>
          In our demo shop, we use PayPal as the confirmation that the customer or agent really completed a purchase. If they did not,
          AI finds the cause, fixes the page and sends the same customer again. If they could already buy,
          we show how much easier the path became. On a real shop tested without its owner, nobody pays: the customer
          stops at the payment step, and that is where the test ends.
        </p>
        <p>
          <strong>On the owner’s own shop, all the way to PayPal:</strong> the owner connects a staging copy of the shop
          and its PayPal sandbox app. The customers pay there with a PayPal test card, and a run passes only when the
          owner’s own sandbox reports the order as COMPLETED.
        </p>
      </Reveal>
    </div>
  );
}

// Not blocked, just slower: the keyboard customer on the long-menu shop, before and after a skip link.
// Every number is computed from the recorded runs' metrics; medians over the runs listed in facts.js.
const EFFORT = [
  { k: 'steps', label: 'Steps', unit: '', cut: 'fewer' },
  { k: 'keys', label: 'Keypresses', unit: '', cut: 'fewer' },
  { k: 'klmSeconds', label: 'Estimated time for a person', unit: ' s', cut: 'less' },
];
const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };

export function EffortBlock() {
  const [m, setM] = useState(null);
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.3 });
  useEffect(() => {
    const ids = [...RUNS.frictionBefore, ...RUNS.frictionAfter];
    Promise.all(ids.map((id) => api(`/api/runs/${id}/metrics`).then((x) => ({ id, ...x })).catch(() => null)))
      .then((list) => {
        const ok = list.filter(Boolean);
        const pick = (group) => ok.filter((x) => group.includes(x.id) && x.success);
        const before = pick(RUNS.frictionBefore);
        const after = pick(RUNS.frictionAfter);
        if (!before.length || !after.length) return;
        setM(Object.fromEntries(EFFORT.map((e) => [e.k, { before: med(before.map((x) => x[e.k])), after: med(after.map((x) => x[e.k])), range: [before, after].map((g) => g.map((x) => x[e.k])) }]).concat([['n', [before.length, after.length]]])));
      });
  }, []);
  const pct = (b, a) => Math.round(((b - a) / b) * 100);
  // The wrapper is always rendered so the in-view observer has something to watch while data loads.
  if (!m) return <div className="effort" ref={ref} />;
  return (
    <div className={`effort ${inView ? 'in' : ''}`} ref={ref}>
      <div className="effort-bars" role="group" aria-label="Effort before and after the skip link">
        {EFFORT.map((e) => {
          const v = m[e.k];
          const max = Math.max(v.before, v.after);
          return (
            <div className="effort-row" key={e.k}>
              <p className="effort-k">{e.label} <span className="effort-cut">{pct(v.before, v.after)}% {e.cut}</span></p>
              <div className="effort-bar before"><span style={{ '--w': `${(v.before / max) * 100}%` }} /><b>{v.before}{e.unit}</b><i>before</i></div>
              <div className="effort-bar after"><span style={{ '--w': `${(v.after / max) * 100}%` }} /><b>{v.after}{e.unit}</b><i>after</i></div>
            </div>
          );
        })}
        <p className="effort-note">
          The median of {m.n[0]} runs before the fix ({m.steps.range[0].join(' and ')} steps) and {m.n[1]} runs after it. The time is
          estimated from the keys pressed and the choices made ({'0.28\u00a0s'} per key, {'1.35\u00a0s'} per decision), not measured with a stopwatch. axe{'\u2011'}core found no problem on the shop’s own code before or after.
          {' '}<a href={`#/runs/${RUNS.frictionBefore[0]}`}>Before</a> · <a href={`#/runs/${RUNS.frictionAfter[0]}`}>After</a> · <a href="#/analytics">All runs</a>
        </p>
      </div>
      <div className="effort-fix">
        <p className="effort-k">The whole fix, on every page</p>
        <pre className="codeblock" tabIndex={0} aria-label="The patch that added a skip link"><span className="c-meta">layout, all pages</span>{'\n'}<span className="del">- {SKIP_FIX.before}</span>{'\n'}<span className="add">+ {SKIP_FIX.after}</span></pre>
        <p>A second demo shop, where the popup does not trap focus: here the keyboard{'\u2011'}only customer could always pay. Before the fix it had to Tab past 24 category links on every page; after it, one “Skip to main content” link takes it straight to the products.</p>
      </div>
    </div>
  );
}

// M7: the problem zone is circled, then the arrow, then the note.
export function AnnotatedShot() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.35 });
  return (
    <figure className={`ann ${inView ? 'in' : ''}`} ref={ref}>
      <div className="ann-img">
        <div className="ann-frame">
        <img src="/img/shop-cart-trap.jpg" alt="The demo shop's cart with a newsletter popup open over it. The popup's close button is circled." loading="lazy" />
        <svg viewBox="0 0 2000 1281" aria-hidden="true" focusable="false">
          <ellipse className="ann-ring" cx="1285" cy="448" rx="78" ry="66" pathLength="100" />
          <path className="ann-arrow" d="M1500 760 C 1480 660, 1420 580, 1350 512" pathLength="100" />
          <path className="ann-head" d="M1338 548 L1350 505 L1388 530" pathLength="100" />
        </svg>
        </div>
        <div className="ann-note">
          <b>Analysis</b>
          <span>Close is out of reach: Tab only cycles Email and Subscribe, and Escape does nothing.</span>
          <span className="ann-wcag">WCAG 2.1.2 No Keyboard Trap</span>
        </div>
      </div>
    </figure>
  );
}

export function CopyCode({ text, label = 'Copy patch' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard not available */ }
  };
  return (
    <button type="button" className="copy-btn" onClick={copy}>
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  );
}

const FIX_ROWS = [
  { title: 'Promo popup traps the keyboard', page: 'Cart', who: 'Keyboard-only customer', run: RUNS.keyboardBlocked, wcag: '2.1.2 No Keyboard Trap', after: 'Paid in 49 steps after the AI fix (7 changes)' },
  { title: 'Pay button is not a real button', page: 'Payment', who: 'AI shopping agent', run: RUNS.agentBlocked, wcag: '4.1.2 Name, Role, Value', after: 'Paid in 19 steps after the AI fix (5 changes)' },
];

export function OwnerOutputs() {
  const patch = `--- pay.html (before)\n+++ pay.html (after)\n-  ${PAY_FIX.before}\n+  ${PAY_FIX.after}\n`;
  return (
    <Reveal className="bento" stagger>
      <article className="bt bt-fixes">
        <header><span className="bt-n">1</span><h3>List of fixes</h3></header>
        <p>Ranked by who they block, each with the run that proves it and the retest result.</p>
        <ol className="fixlist">
          {FIX_ROWS.map((r) => (
            <li key={r.title}>
              <div className="fl-top"><span className="dot-word bad">Blocker</span><strong>{r.title}</strong></div>
              <p>{r.page} page · blocked: {r.who} · <a href={`#/runs/${r.run}`}>Replay</a></p>
              <p>WCAG {r.wcag} · axe-core: not flagged</p>
              <p className="fl-after"><span className="dot-word ok">Retest</span> {r.after}</p>
            </li>
          ))}
        </ol>
      </article>
      <article className="bt bt-code">
        <header><span className="bt-n">2</span><h3>Ready code</h3><CopyCode text={patch} /></header>
        <p>The exact change for the page, written by the AI fixer and checked by a rerun.</p>
        <pre className="codeblock" tabIndex={0} aria-label="Patch for the payment page"><span className="c-meta">pay.html</span>{'\n'}<span className="del">- {PAY_FIX.before}</span>{'\n'}<span className="add">+ {PAY_FIX.after}</span></pre>
        <p className="bt-why">Why: {PAY_FIX.why}</p>
        <ul className="bt-checks">
          <li><span>Matched the page</span><b>exactly once</b></li>
          <li><span>Same agent, rerun</span><b>paid in {ORDERS.agentFixed.steps} steps</b></li>
          <li><span>PayPal</span><b>payment confirmed</b></li>
        </ul>
      </article>
      <article className="bt bt-shot">
        <header><span className="bt-n">3</span><h3>Annotated screenshot</h3></header>
        <p>The real page at the step where the customer stopped, with the problem circled.</p>
        <AnnotatedShot />
      </article>
      <article className="bt bt-pdf">
        <header><span className="bt-n">4</span><h3>PDF report</h3><span className="dot-chip ok">Ready</span></header>
        <p>The same content as a tagged, accessible PDF for the team that will fix it: verdict, scorecard, annotated screenshots, ready code, PayPal proof.</p>
        <div className="pdf-stack" aria-hidden="true">
          <div className="pdf-page back" />
          <div className="pdf-page">
            <div className="pdf-cover"><LogoMark size={28} /><span>Checkout accessibility report</span></div>
            <div className="pdf-row"><b>Who could pay</b><span className="pdf-pill ok">Screen reader</span><span className="pdf-pill bad">Keyboard</span><span className="pdf-pill bad">AI agent</span></div>
            <div className="pdf-lines"><i /><i /><i style={{ width: '62%' }} /></div>
            <div className="pdf-row"><b>Fixes</b><span>2 blockers</span></div>
            <div className="pdf-lines"><i /><i style={{ width: '78%' }} /></div>
          </div>
        </div>
        <a className="lp-link" href={`/api/report/case/${RUNS.agentBlocked}.pdf`}>Download a real report (PDF) <Arrow /></a>{' '}<a className="lp-link" href={`#/report/case/${RUNS.agentBlocked}`}>Open it in the browser <Arrow /></a>
      </article>
    </Reveal>
  );
}

// Real shops on the home page: every complete analysis, three customers each, from /api/sites.
const RS_PERSONAS = [['screenreader', 'Screen reader'], ['keyboard', 'Keyboard'], ['agent', 'AI agent']];
export function RealShops() {
  const [list, setList] = useState(null);
  useEffect(() => { api('/api/sites').then(setList).catch(() => setList([])); }, []);
  if (!list) return null;
  const analysed = list.filter((s) => s.complete && !s.notTestable && !s.running);
  const away = list.filter((s) => s.notTestable && !s.running);
  const testing = list.filter((s) => s.running);
  const runs = analysed.reduce((t, s) => t + s.tested, 0);
  const reached = analysed.reduce((t, s) => t + s.reached, 0);
  const word = (o) => (o === 'reached-payment' ? 'Reached payment' : o === 'not-testable' ? 'Not counted' : o === 'blocked' ? 'Stopped' : 'Testing');
  const tone = (o) => (o === 'reached-payment' ? 'ok' : o === 'blocked' ? 'bad' : 'muted');
  return (
    <div className="rshops">
      <ul className="rshops-stats">
        <li><b>{analysed.length}</b><span>shops tested by all three customers</span></li>
        <li><b>{runs ? `${reached} of ${runs}` : '—'}</b><span>customer runs reached the payment step</span></li>
        <li><b>{away.length}</b><span>shops turned our browser away</span></li>
        {testing.length > 0 && <li><b>{testing.length}</b><span>being tested right now</span></li>}
      </ul>
      {analysed.length > 0 && (
        <ul className="rshops-grid">
          {analysed.slice(0, 3).map((s) => (
            <li key={s.key}>
              <a className="rshop" href={`#/sites/${encodeURIComponent(s.key)}`}>
                <span className="rshop-name">{s.key}</span>
                <span className="rshop-v">{s.reached} of {s.tested} reached payment</span>
                <span className="rshop-rows">
                  {RS_PERSONAS.map(([p, l]) => {
                    const c = s.customers[p];
                    return <span key={p} className="rshop-row"><span>{l}</span><span className={`dot-word ${tone(c?.outcome)}`}>{word(c?.outcome)}{c?.steps != null ? `, ${c.steps} steps` : ''}</span></span>;
                  })}
                </span>
                <span className="rshop-open">Open the analysis <Arrow /></span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="rshops-more"><a className="lp-link" href="#/results">Every shop, with its whole analysis <Arrow /></a></p>
    </div>
  );
}

export function MethodStrip() {
  return (
    <Reveal as="ol" className="mstrip" stagger>
      {METHOD.map((m) => (
        <li key={m.n}>
          <span className="ms-n">{String(m.n).padStart(2, '0')}</span>
          <h3>{m.title}</h3>
          <p>{m.short}</p>
        </li>
      ))}
    </Reveal>
  );
}

const LEDGER_ORDER = [RUNS.screenReader, RUNS.keyboardBlocked, RUNS.keyboardFixed, RUNS.agentBlocked, RUNS.agentFixed, RUNS.agentClean];

export function Ledger({ meta }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api('/api/runs').then((list) => setRows(LEDGER_ORDER.map((id) => list.find((r) => r.id === id)).filter(Boolean))).catch(() => setRows([]));
  }, []);
  const label = (r) => {
    const shop = r.defects?.length ? meta.defects.find((d) => d.id === r.defects[0])?.short : 'Clean shop';
    const task = r.goalId === 'agentic' ? 'Agentic buyer task' : shop;
    return `${task}${r.patches?.length ? ', after AI fix' : ''}`;
  };
  return (
    <div className="ledger">
      <div className="ledger-head" aria-hidden="true">
        <span>Customer</span><span>Shop</span><span>Scanner</span><span>Outcome</span><span className="num">Amount</span><span>PayPal</span>
      </div>
      <ul className="ledger-list" aria-label="Recorded runs against the PayPal sandbox">
        {(rows || []).map((r) => {
          const ok = r.outcome?.status === 'purchased';
          return (
            <li key={r.id}><a className="ledger-row" href={`#/runs/${r.id}`}>
              <span className="strong">{meta.personas[r.persona]?.label}<span className="sr-only">,</span></span>
              <span>{label(r)}<span className="sr-only">,</span></span>
              <span>{r.scan?.totalViolations ?? '—'} violations<span className="sr-only">,</span></span>
              <span><span className={`dot-word ${ok ? 'ok' : 'bad'}`}>{ok ? 'Paid' : 'Blocked'}</span><span className="sr-only">,</span></span>
              <span className="num mono">{r.payment ? `$${Number(r.payment.amount).toFixed(2)}` : <span aria-hidden="true">—</span>}</span>
              <span>{r.payment?.status === 'COMPLETED' ? 'Confirmed' : 'No payment'}</span>
            </a></li>
          );
        })}
      </ul>
      {rows === null && <p className="ledger-empty">Loading recorded runs…</p>}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="sfoot">
      <div className="wrap sfoot-in">
        <div className="sfoot-brand">
          <Logo size={34} />
          <p>Accessibility, measured in completed payments. Built for the PayPal AI Hackathon 2026.</p>
        </div>
        <nav aria-label="Footer">
          <ul>
            <li><a href="#/">Overview</a></li>
            <li><a href="#/method">Method</a></li>
            <li><a href="#/customers">Customers</a></li>
            <li><a href="#/paypal">For PayPal</a></li>
          </ul>
          <ul>
            <li><a href="#/results">Results</a></li>
            <li><a href="#/analytics">Analytics</a></li>
            <li><a href="#/test">Run a test</a></li>
          </ul>
        </nav>
      </div>
      <div className="wrap sfoot-fine">
        <span>The demo shop and all payments run in the PayPal sandbox. No real money moves.</span>
        <span>Customers are simulated. Not a WCAG certificate.</span>
      </div>
    </footer>
  );
}
