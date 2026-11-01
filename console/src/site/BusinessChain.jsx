import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { RUNS, ORDERS } from './facts.js';
import { useInView, usePageVisible, useReducedMotion } from './motion.jsx';

// Three kinds of number, three styles, everywhere (paypal-judge.md, section 2):
// Measured (came from a run), Your number (the merchant types it), Calculated (arithmetic on the two).
export function Kind({ k }) {
  const label = { measured: 'Measured', yours: 'Your number', calc: 'Calculated' }[k];
  return <span className={`kind kind-${k}`}>{label}</span>;
}

export function KindLegend() {
  return (
    <ul className="kind-legend" aria-label="How to read the numbers">
      <li><Kind k="measured" /> comes from a recorded run</li>
      <li><Kind k="yours" /> you type it; we never fill it in</li>
      <li><Kind k="calc" /> arithmetic on the two, formula shown</li>
    </ul>
  );
}

const NODES = [
  { k: 'step', title: 'A merchant runs AccessiPay', body: 'Three simulated customers try to buy. Blockers are found and fixed.' },
  { k: 'measured', title: 'More customers can pay', body: 'Keyboard-only: blocked, then paid. AI shopping agent: blocked, then paid.', links: [[RUNS.keyboardFixed, 'Replay keyboard'], [RUNS.agentFixed, 'Replay agent']] },
  { k: 'yours', title: 'Customers who reach checkout', body: 'Your monthly checkout starts and who they are.' },
  { k: 'calc', title: 'Orders recovered', body: 'Blocked customers who can now pay, at your usual conversion.' },
  { k: 'calc', title: 'Paid with PayPal', body: 'Recovered revenue times your PayPal share.' },
  { k: 'calc', title: 'PayPal revenue', body: 'PayPal volume times the fee rate you enter.' },
];

// M8: green dots travel along the connectors, "orders flowing to PayPal". Pause control; paused on hover/focus,
// off-screen and in a hidden tab; static under reduced motion.
export function Chain() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.2, once: false });
  const visible = usePageVisible();
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const running = !paused && inView && visible && !reduced;
  const seen = useInView(ref, { threshold: 0.2 });
  // A purchase travels the chain: each link lights up in turn, from the merchant's test to PayPal revenue.
  const [lit, setLit] = useState(-1);
  useEffect(() => {
    if (!running) return undefined;
    const t = setTimeout(() => setLit((n) => (n >= NODES.length + 1 ? -1 : n + 1)), lit < 0 ? 900 : lit >= NODES.length - 1 ? 1600 : 1100);
    return () => clearTimeout(t);
  }, [running, lit]);
  return (
    <div className={`chain ${running ? 'running' : ''} ${seen || reduced ? 'seen' : ''}`} ref={ref}>
      <ol className="chain-list">
        {NODES.map((n, i) => (
          <li key={n.title} className={`chain-node k-${n.k}${i <= lit && lit < NODES.length ? ' past' : ''}${i === lit ? ' lit' : ''}`} style={{ '--i': i }}>
            <span className="chain-n" aria-hidden="true">{i + 1}</span>
            {n.k !== 'step' && <Kind k={n.k} />}
            <h3>{n.title}</h3>
            <p>{n.body}</p>
            {n.links && <p className="chain-links">{n.links.map(([id, t]) => <a key={id} href={`#/runs/${id}`}>{t}</a>)}</p>}
            {i < NODES.length - 1 && <span className="chain-wire" aria-hidden="true"><i /><i /></span>}
          </li>
        ))}
      </ol>
      <div className="chain-foot">
        <p>One more effect: a checkout that assistive technology can finish is one that AI agents can finish too, so purchases made by agents can reach PayPal as well. We put no number on it.</p>
        {!reduced && (
          <button type="button" className="ghost-btn on-navy" onClick={() => setPaused(!paused)}>
            {paused ? 'Play the flow' : 'Pause the flow'}
          </button>
        )}
      </div>
    </div>
  );
}

// Labels stay on one line; the helper text sits under the field.
const FIELDS = [
  { id: 'starts', label: 'Checkout starts per month', unit: 'sessions', help: 'From your analytics.' },
  { id: 'aov', label: 'Average order value', unit: '', help: 'From your store, in your currency.' },
  { id: 'conv', label: 'Usual checkout conversion', unit: '%', help: 'Recovered customers convert at this rate too.' },
  { id: 'sr', label: 'Screen reader users', unit: '%', help: 'Your estimate: share of checkout starts.' },
  { id: 'kb', label: 'Keyboard-only users', unit: '%', help: 'Your estimate: share of checkout starts.' },
  { id: 'ag', label: 'AI shopping agents', unit: '%', help: 'Your estimate; it will change over time.' },
  { id: 'pp', label: 'Orders paid with PayPal', unit: '%', help: 'From your PayPal and store reports.' },
  { id: 'fee', label: 'Your PayPal fee rate', unit: '%', help: 'From your PayPal statement.' },
  { id: 'n', label: 'Merchants like you', unit: 'count', help: 'Optional scenario; real merchants differ.' },
];
const SHARE = { sr: 'Screen reader customer', kb: 'Keyboard-only customer', ag: 'AI shopping agent' };
const EXAMPLE = { starts: '10000', aov: '60', conv: '40', sr: '1', kb: '2', ag: '1', pp: '30', fee: '3', n: '100' };
const EMPTY = Object.fromEntries(FIELDS.map((f) => [f.id, '']));

const num = (s) => {
  if (s === '' || s == null) return null;
  const v = Number(String(s).replace(/[\s,]/g, ''));
  return Number.isFinite(v) && v >= 0 ? v : null;
};
const fmt = (v, digits = 0) => (v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }));

export function Calculator() {
  const uid = useId();
  const [v, setV] = useState(EMPTY);
  const [example, setExample] = useState(false);
  const [blocked, setBlocked] = useState({ sr: false, kb: true, ag: true });
  const set = (id) => (e) => { setV({ ...v, [id]: e.target.value }); setExample(false); };

  const out = useMemo(() => {
    const n = Object.fromEntries(Object.entries(v).map(([k, s]) => [k, num(s)]));
    const shares = [['sr', n.sr], ['kb', n.kb], ['ag', n.ag]].filter(([k]) => blocked[k]);
    const sharesKnown = shares.length > 0 && shares.every(([, s]) => s != null);
    const blockedShare = sharesKnown ? shares.reduce((a, [, s]) => a + s, 0) / 100 : null;
    const orders = blockedShare != null && n.starts != null && n.conv != null ? n.starts * blockedShare * (n.conv / 100) : null;
    const revenue = orders != null && n.aov != null ? orders * n.aov : null;
    const ppVol = revenue != null && n.pp != null ? revenue * (n.pp / 100) : null;
    const ppRev = ppVol != null && n.fee != null ? ppVol * (n.fee / 100) : null;
    const scen = ppRev != null && n.n != null ? ppRev * n.n : null;
    return { blockedShare, orders, revenue, ppVol, ppRev, scen, nMerchants: n.n };
  }, [v, blocked]);

  const anyBlocked = blocked.sr || blocked.kb || blocked.ag;
  const anyResult = out.blockedShare != null;
  const results = [
    { label: 'Share of checkout starts that were blocked', value: out.blockedShare == null ? '—' : `${fmt(out.blockedShare * 100, 1)}%`, formula: 'sum of the shares of the customer types your test found blocked' },
    { label: 'Orders recovered per month', value: fmt(out.orders, 0), formula: 'checkout starts × blocked share × usual conversion' },
    { label: 'Revenue recovered per month', value: fmt(out.revenue, 0), unit: 'your currency', formula: 'orders recovered × average order value' },
    { label: 'Of which paid with PayPal', value: fmt(out.ppVol, 0), unit: 'your currency', formula: 'revenue recovered × PayPal share' },
    { label: 'PayPal fee revenue per month', value: fmt(out.ppRev, 2), unit: 'your currency', formula: 'PayPal volume × your fee rate', strong: true },
    { label: `Scenario: ${out.nMerchants ? fmt(out.nMerchants) : 'N'} merchants like you`, value: fmt(out.scen, 0), unit: 'your currency', formula: 'PayPal fee revenue × number of merchants (an illustration, not a sum of real shops)' },
  ];

  return (
    <div className="calc">
      <div className="calc-head">
        <div>
          <h3 id={`${uid}-t`}>Your numbers</h3>
          <p>The fields start empty. We do not fill in market statistics.</p>
        </div>
        <div className="calc-actions">
          <button type="button" className="ghost-btn" onClick={() => { setV(EXAMPLE); setExample(true); }}>Fill with a made-up example</button>
          <button type="button" className="ghost-btn" onClick={() => { setV(EMPTY); setExample(false); }}>Clear</button>
        </div>
      </div>
      {example && <p className="calc-example" role="status">Made-up example, not data. Replace every field with your own numbers.</p>}

      <div className="calc-sub">
        <Kind k="measured" />
        <h4 id={`${uid}-m`}>Customer types your test found blocked</h4>
      </div>
      <div className="calc-measured" role="group" aria-labelledby={`${uid}-m`}>
        <div className="calc-checks">
          {[['sr', 'Screen reader'], ['kb', 'Keyboard-only'], ['ag', 'AI shopping agent']].map(([k, l]) => (
            <label key={k} className="calc-check">
              <input type="checkbox" checked={blocked[k]} onChange={(e) => setBlocked({ ...blocked, [k]: e.target.checked })} />
              <span>{l}</span>
            </label>
          ))}
        </div>
        <p className="calc-help">
          Set from the demo shop’s test: the keyboard-only customer (<a href={`#/runs/${RUNS.keyboardBlocked}`}>Replay<span className="sr-only"> the keyboard-only run</span></a>)
          {' '}and the AI shopping agent (<a href={`#/runs/${RUNS.agentBlocked}`}>Replay<span className="sr-only"> the AI shopping agent run</span></a>) were blocked; both paid after the fix, confirmed by PayPal. Your own test sets these.
        </p>
      </div>

      <div className="calc-sub">
        <Kind k="yours" />
        <h4>Your shop</h4>
      </div>
      <div className="calc-grid">
        {FIELDS.map((f) => {
          const off = f.id in SHARE && !blocked[f.id];
          return (
            <div key={f.id} className={`calc-field${off ? ' off' : ''}`}>
              <label htmlFor={`${uid}-${f.id}`}>{f.label}</label>
              <div className="calc-input">
                <input id={`${uid}-${f.id}`} type="text" inputMode="decimal" autoComplete="off" value={off ? '' : v[f.id]} onChange={set(f.id)}
                  placeholder={off ? 'Not counted' : 'Enter your number'} disabled={off} aria-describedby={`${uid}-${f.id}-h`} />
                <span className="calc-unit" aria-hidden="true">{f.unit}</span>
              </div>
              <p id={`${uid}-${f.id}-h`} className="calc-help">{off ? 'Not blocked in your test, so not counted.' : f.help}</p>
            </div>
          );
        })}
      </div>

      <div className="calc-out">
        {!anyBlocked ? (
          <p className="calc-empty">No customer type is marked as blocked, so there is nothing to recover.</p>
        ) : !anyResult ? (
          <p className="calc-empty">Results appear here once you enter your numbers. To see how it works, use the made-up example above.</p>
        ) : (
          <ul>
            {results.map((r) => (
              <li key={r.label} className={r.strong ? 'strong' : ''}>
                <Kind k="calc" />
                <span className="calc-out-label">{r.label}</span>
                <p className="calc-out-v tnum" key={r.value}>{r.value}{r.unit && r.value !== '—' ? <small> {r.unit}</small> : null}</p>
                <p className="calc-formula">{r.formula}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="calc-foot">
        <strong>Not a forecast.</strong> An illustration built from your numbers and our test results. “Blocked” means our simulated customer could not pay on the tested path; real customers may find another way or may leave.
      </p>
    </div>
  );
}
