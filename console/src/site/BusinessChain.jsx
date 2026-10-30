import React, { useId, useMemo, useRef, useState } from 'react';
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
      <li><Kind k="measured" /> came from a recorded run</li>
      <li><Kind k="yours" /> you type it; we never fill it in</li>
      <li><Kind k="calc" /> arithmetic on the two, formula shown</li>
    </ul>
  );
}

const NODES = [
  { k: 'measured', title: 'A merchant runs AccessiPay', body: 'Three simulated customers try to buy. Blockers are found and fixed.' },
  { k: 'measured', title: 'More customers can pay', body: `Keyboard-only: blocked, then paid. AI agent: blocked, then paid.`, links: [[RUNS.keyboardFixed, 'keyboard run'], [RUNS.agentFixed, 'agent run']] },
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
  return (
    <div className={`chain ${running ? 'running' : ''}`} ref={ref}>
      <ol className="chain-list">
        {NODES.map((n, i) => (
          <li key={n.title} className={`chain-node k-${n.k}`}>
            <span className="chain-n" aria-hidden="true">{i + 1}</span>
            <Kind k={n.k} />
            <h3>{n.title}</h3>
            <p>{n.body}</p>
            {n.links && <p className="chain-links">{n.links.map(([id, t]) => <a key={id} href={`#/runs/${id}`}>{t}</a>)}</p>}
            {i < NODES.length - 1 && <span className="chain-wire" aria-hidden="true"><i /><i /></span>}
          </li>
        ))}
      </ol>
      <div className="chain-foot">
        <p>The return path: checkouts that assistive technology can finish are checkouts AI agents can finish, so agent purchases can reach PayPal too. No number is claimed for it.</p>
        {!reduced && (
          <button type="button" className="ghost-btn on-navy" onClick={() => setPaused(!paused)}>
            {paused ? 'Play the flow' : 'Pause the flow'}
          </button>
        )}
      </div>
    </div>
  );
}

const FIELDS = [
  { id: 'starts', label: 'Checkout starts per month', unit: 'sessions', help: 'From your analytics: sessions that reach cart or checkout.' },
  { id: 'aov', label: 'Average order value', unit: 'your currency', help: 'From your store.' },
  { id: 'conv', label: 'Usual checkout conversion', unit: '%', help: 'Share of checkout starts that become orders today. Recovered customers are assumed to convert at this rate, not 100%.' },
  { id: 'sr', label: 'Share of starts by screen reader users', unit: '%', help: 'Your estimate.' },
  { id: 'kb', label: 'Share by keyboard-only users', unit: '%', help: 'Your estimate.' },
  { id: 'ag', label: 'Share by AI shopping agents', unit: '%', help: 'Your estimate; it will change over time.' },
  { id: 'pp', label: 'Share of orders paid with PayPal', unit: '%', help: 'From your PayPal and store reports.' },
  { id: 'fee', label: 'Your PayPal fee rate', unit: '%', help: 'From your PayPal statement.' },
  { id: 'n', label: 'Merchants like you (scenario)', unit: 'count', help: 'Optional. Multiplies one merchant’s result; real merchants differ.' },
];
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

      <fieldset className="calc-measured">
        <legend><Kind k="measured" /> Customer types your test found blocked</legend>
        <p className="calc-help">Set here from the demo shop’s test: the keyboard-only customer (<a href={`#/runs/${RUNS.keyboardBlocked}`}>run {RUNS.keyboardBlocked.slice(-6)}</a>) and the AI agent (<a href={`#/runs/${RUNS.agentBlocked}`}>run {RUNS.agentBlocked.slice(-6)}</a>) were blocked; both paid after the fix, confirmed by PayPal. Your own test sets these.</p>
        <div className="calc-checks">
          {[['sr', 'Screen reader'], ['kb', 'Keyboard-only'], ['ag', 'AI agent']].map(([k, l]) => (
            <label key={k} className="calc-check">
              <input type="checkbox" checked={blocked[k]} onChange={(e) => setBlocked({ ...blocked, [k]: e.target.checked })} />
              <span>{l}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="calc-grid">
        {FIELDS.map((f) => (
          <div key={f.id} className="calc-field">
            <label htmlFor={`${uid}-${f.id}`}>{f.label}{['sr', 'kb', 'ag'].includes(f.id) && !blocked[f.id] && <span className="calc-off"> · not counted</span>}</label>
            <div className="calc-input">
              <input id={`${uid}-${f.id}`} type="text" inputMode="decimal" autoComplete="off" value={v[f.id]} onChange={set(f.id)}
                placeholder="Enter your number" aria-describedby={`${uid}-${f.id}-h`} />
              <span className="calc-unit" aria-hidden="true">{f.unit === 'your currency' ? '' : f.unit}</span>
            </div>
            <p id={`${uid}-${f.id}-h`} className="calc-help"><Kind k="yours" /> {f.help}{f.unit === 'your currency' ? ' In your currency.' : ''}</p>
          </div>
        ))}
      </div>

      <div className="calc-out">
        {!anyBlocked && <p className="calc-help">No customer type is marked as blocked, so there is nothing to recover.</p>}
        <ul>
          {results.map((r) => (
            <li key={r.label} className={r.strong ? 'strong' : ''}>
              <div className="calc-out-top"><Kind k="calc" /><span className="calc-out-label">{r.label}</span></div>
              <p className="calc-out-v tnum">{r.value}{r.unit && r.value !== '—' ? <small> {r.unit}</small> : null}</p>
              <p className="calc-formula">{r.formula}</p>
            </li>
          ))}
        </ul>
      </div>
      <p className="calc-foot">
        <strong>Not a forecast.</strong> An illustration built from your numbers and our test results. “Blocked” means our simulated customer could not pay on the tested path; real customers may find another way or may leave.
      </p>
    </div>
  );
}
