import React, { useEffect, useState } from 'react';
import { api, OUTCOME, shortDate } from './api.js';
import { RUNS } from './site/facts.js';
import { OwnShopSteps, AgentAccessResult } from './OwnSite.jsx';

// One page for every test: pick where the customers shop, then who shops.
// A real shop's address is entered once: it is checked first, then either the customers go, or its owner connects it.
const WHERE = [
  { id: 'demo', title: 'Our demo shop', note: 'Clean, or with the checkout defects we built. Payment runs in the PayPal sandbox and passes only when PayPal reports COMPLETED.' },
  { id: 'real', title: 'A real shop', note: 'Any shop by its address. All three customers go as far as the payment step and stop. A shop behind bot protection can be connected by its owner.' },
];
const URL_OK = /^https?:\/\/[^/\s]+\.\S*$/;

export default function NewTest({ meta, initialWhere = 'demo' }) {
  const train = meta.defects.filter((d) => d.split === 'train');
  const [where, setWhere] = useState(initialWhere === 'own' ? 'real' : initialWhere);
  const [access, setAccess] = useState(null); // the "Can AI assistants shop here?" result for siteUrl
  const [checking, setChecking] = useState(false);
  const [own, setOwn] = useState(false); // the owner connects the shop (shown after the check)
  const [scenario, setScenario] = useState('focus-trap-modal');
  const [custom, setCustom] = useState([]);
  const [persona, setPersona] = useState('screenreader');
  const brain = meta.claude ? 'anthropic' : 'external';
  // Without a Claude API key a run would wait for a Claude Code agent (tools/agent.mjs); the console only starts live runs.
  const live = meta.claude || /[?&]agent=1\b/.test(location.search);
  const [goalId, setGoalId] = useState('checkout');
  const [siteUrl, setSiteUrl] = useState('https://');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);
  useEffect(() => { setWhere(initialWhere === 'own' ? 'real' : initialWhere); }, [initialWhere]);
  async function checkShop() {
    setChecking(true); setError(''); setAccess(null); setOwn(false);
    try { setAccess(await api(`/api/agent-access?url=${encodeURIComponent(siteUrl)}`)); } catch (e) { setError(e.message); }
    setChecking(false);
  }

  useEffect(() => { api('/api/runs').then((r) => {
    // Newest first, one row per customer and scenario.
    const seen = new Set();
    setRecent(r.filter((x) => !x.site && x.payment?.mode !== 'mock' && x.steps > 0).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .filter((x) => { const k = `${x.persona}|${x.defects.join(',')}|${x.patches?.length ? 1 : 0}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8));
  }).catch(() => {}); }, []);

  const scenarios = [
    { id: 'clean', title: 'Clean shop', note: 'No defects. The control: every customer should be able to buy.' },
    ...train.map((d) => ({ id: d.id, title: d.short, note: `${d.title}. ${d.page[0].toUpperCase() + d.page.slice(1)} page.` })),
    { id: 'custom', title: 'Pick defects', note: `Any combination of the ${meta.defects.length} defects.` },
  ];
  const defects = scenario === 'clean' ? [] : scenario === 'custom' ? custom : [scenario];

  async function start() {
    setBusy(true); setError('');
    try {
      if (where === 'real') {
        const t = await api('/api/site-tests', { url: siteUrl, brain });
        location.hash = `#/sites/${encodeURIComponent(t.key)}`;
        return;
      }
      const r = await api('/api/runs', { persona, brain, defects, goalId: persona === 'agent' ? goalId : 'checkout' });
      location.hash = `#/runs/${r.id}`;
    } catch (e) { setError(e.message); setBusy(false); }
  }

  const liveNote = meta.claude ? <p className="note">Claude decides each step of the customer, live.</p> : (
    <p className="note">Starting new tests is turned off in this public demo: each run has an AI model decide every step, and that has a cost. Instead, you can replay any recorded run step by step, for example <a href={`#/runs/${RUNS.agentBlocked}`}>the AI agent stopped by a Pay button that is not a real button</a> or <a href={`#/runs/${RUNS.keyboardFixed}`}>the keyboard customer paying after the fix</a>.</p>
  );
  const startButton = (disabled, extra = null) => (
    <p className="row" style={{ marginTop: 14 }}>
      <button type="button" className="btn primary" onClick={start} disabled={busy || !live || disabled}>{busy ? 'Starting…' : live ? 'Start test' : 'Start test (off in this demo)'}</button>
      {extra}
      {error && <span role="alert" className="pill bad">{error}</span>}
    </p>
  );

  return (
    <div className="page">
      <p className="eyebrow">Run a test</p>
      <h1>Send customers to buy</h1>
      <p className="lead">Pick where they shop and who shops. The run streams live, step by step; the scanner checks the same pages at the end.</p>

      <section aria-labelledby="t-where" style={{ marginBottom: 24 }}>
        <h2 className="section-title" id="t-where"><span className="step-no">1</span>Where do they shop?</h2>
        <div className="test-where">
          {WHERE.map((w) => (
            <button key={w.id} type="button" className="choice" aria-pressed={where === w.id} onClick={() => { setWhere(w.id); setError(''); }}>
              <strong>{w.title}</strong><span>{w.note}</span>
            </button>
          ))}
        </div>
      </section>

      {where === 'demo' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="card" aria-labelledby="s1">
            <h2 className="section-title" id="s1"><span className="step-no">2</span>Which demo shop</h2>
            <p className="note" style={{ marginTop: 0 }}>{meta.paypal === 'sandbox' ? 'Payments run in the PayPal sandbox. No real money moves.' : 'Mock payments: this server makes no PayPal call.'}</p>
            <div className="test-options">
              {scenarios.map((s) => (
                <button key={s.id} type="button" className="choice" aria-pressed={scenario === s.id} onClick={() => setScenario(s.id)}>
                  <strong>{s.title}</strong><span>{s.note}</span>
                </button>
              ))}
            </div>
            {scenario === 'custom' && (
              <fieldset className="test-defects">
                <legend className="note">Defects to switch on</legend>
                {meta.defects.map((d) => (
                  <label key={d.id}>
                    <input type="checkbox" checked={custom.includes(d.id)} onChange={(e) => setCustom(e.target.checked ? [...custom, d.id] : custom.filter((x) => x !== d.id))} />
                    <span>{d.short}{d.split === 'holdout' && <span className="tag">holdout</span>}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </section>

          <div className="grid-2">
          <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <section className="card" aria-labelledby="s2">
              <h2 className="section-title" id="s2"><span className="step-no">3</span>Who is shopping</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {Object.entries(meta.personas).map(([id, p]) => (
                  <button key={id} type="button" className="choice" aria-pressed={persona === id} onClick={() => setPersona(id)}>
                    <strong>{p.label}</strong><span>{p.summary}</span>
                  </button>
                ))}
              </div>
            </section>

            {persona === 'agent' && (
              <section className="card" aria-labelledby="s-task">
                <h2 className="section-title" id="s-task"><span className="step-no">+</span>What the agent is asked to do</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                  {Object.entries(meta.goals).map(([id, g]) => (
                    <button key={id} type="button" className="choice" aria-pressed={goalId === id} onClick={() => setGoalId(id)}>
                      <strong>{g.label}</strong><span>{id === 'agentic' ? 'The customer describes a need. The agent chooses the product and the delivery, then pays. It only counts if it bought the right thing.' : 'Buy one Trail Backpack with standard delivery.'}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <section className="card" aria-labelledby="s3">
              <h2 className="section-title" id="s3"><span className="step-no">4</span>Start</h2>
              {liveNote}
              {startButton(scenario === 'custom' && !custom.length)}
            </section>

            <section className="card" aria-labelledby="s4">
              <h2 className="section-title" id="s4">Recent runs in the demo shop</h2>
              {recent.length === 0 ? <p className="note">No runs yet.</p> : (
                <ul className="recent-runs">
                  {recent.map((r) => (
                    <li key={r.id}>
                      <a href={`#/runs/${r.id}`}>{meta.personas[r.persona]?.label}, {r.defects.length ? r.defects.map((id) => meta.defects.find((d) => d.id === id)?.short || id).join(', ') : 'clean shop'}{r.patches?.length ? ', after the fix' : ''}</a>
                      <span className={`pill ${OUTCOME[r.outcome?.status]?.tone || 'muted'}`}>{OUTCOME[r.outcome?.status]?.label || r.status}</span>
                      <span className="note">{shortDate(r.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          </div>
        </div>
      )}

      {where === 'real' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="card" aria-labelledby="s-site">
            <h2 className="section-title" id="s-site"><span className="step-no">2</span>Shop address</h2>
            {initialWhere === 'own' && !access && <p className="note" style={{ marginTop: 0 }}>Enter your shop’s address. If it is behind bot protection, you can connect it right after the check.</p>}
            <label htmlFor="site-url" className="note" style={{ display: 'block', marginBottom: 6 }}>Home page, or a staging copy of the shop</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="site-url" type="url" value={siteUrl} onChange={(e) => { setSiteUrl(e.target.value); setAccess(null); setOwn(false); }} onKeyDown={(e) => { if (e.key === 'Enter' && URL_OK.test(siteUrl)) checkShop(); }} style={{ flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)' }} />
              <button type="button" className="btn primary" onClick={checkShop} disabled={checking || !URL_OK.test(siteUrl)}>{checking ? 'Checking…' : 'Check the shop'}</button>
            </div>
            <p className="note">First we read what the shop tells AI assistants (robots.txt, llms.txt, product data) and load its home page once, to see whether it lets an automated browser in. We never pretend to be another company’s agent.</p>
            {access && <AgentAccessResult r={access} />}
            {error && !busy && <p className="note" role="alert" style={{ color: 'var(--bad)' }}>{error}</p>}
          </section>

          {access && !access.automation.wall && !own && (
            <section className="card" aria-labelledby="s-go">
              <h2 className="section-title" id="s-go"><span className="step-no">3</span>Send the three customers</h2>
              <p>A screen reader user, a keyboard-only user and an AI shopping agent shop at the same time. Their results come together as one analysis of the shop.</p>
              <p className="note">Each stops at the payment step: no order is placed and no card data is typed. The shop let our browser in, so it does not need to be connected. Only the home page was loaded in the check, though: if the shop shows a bot check later, the run stops there, and its owner can connect it.</p>
              {liveNote}
              {startButton(false, <button type="button" className="btn" onClick={() => setOwn(true)}>This is my shop: connect it</button>)}
            </section>
          )}

          {access && access.automation.wall && !own && (
            <section className="card" aria-labelledby="s-wall">
              <h2 className="section-title" id="s-wall"><span className="step-no">3</span>The shop turned our browser away</h2>
              <p>AccessiPay never tries to get past bot protection, so the customers cannot shop here as things are. If this is your shop, you can let the test in: prove the site is yours and add one allow rule. The protection stays on for everyone else.</p>
              <button type="button" className="btn primary" onClick={() => setOwn(true)}>This is my shop: connect it</button>
            </section>
          )}

          {own && <OwnShopSteps meta={meta} fixedUrl={siteUrl} first={3} />}
        </div>
      )}
    </div>
  );
}
