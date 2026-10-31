import React, { useEffect, useState } from 'react';
import { api, OUTCOME, shortDate } from './api.js';
import { RUNS } from './site/facts.js';


export default function NewTest({ meta }) {
  const train = meta.defects.filter((d) => d.split === 'train');
  const [scenario, setScenario] = useState('focus-trap-modal');
  const [custom, setCustom] = useState([]);
  const [persona, setPersona] = useState('screenreader');
  const brain = meta.claude ? 'anthropic' : 'external';
  // Without a Claude API key a run would wait for a Claude Code agent (tools/agent.mjs); the console only starts live runs.
  const live = meta.claude || /[?&]agent=1\b/.test(location.search);
  const [goalId, setGoalId] = useState('checkout');
  const [siteUrl, setSiteUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);

  useEffect(() => { api('/api/runs').then((r) => {
    // Newest first, one row per customer and scenario.
    const seen = new Set();
    setRecent(r.filter((x) => !x.site && x.payment?.mode !== 'mock' && x.steps > 0).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .filter((x) => { const k = `${x.persona}|${x.defects.join(',')}|${x.patches?.length ? 1 : 0}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8));
  }).catch(() => {}); }, []);
  const proof = recent.find((r) => r.outcome?.status === 'blocked' && r.scan?.totalViolations === 0 && r.defects?.length && !r.patches?.length);

  const scenarios = [
    { id: 'clean', title: 'Clean shop', note: 'No defects. The control: every customer should be able to buy.' },
    ...train.map((d) => ({ id: d.id, title: d.short, note: `${d.title}. ${d.page[0].toUpperCase() + d.page.slice(1)} page.` })),
    { id: 'custom', title: 'Pick defects', note: `Any combination of the ${meta.defects.length} defects.` },
    { id: 'site', title: 'A real shop', note: 'All three customers go as far as the payment step and stop. Never pays, never types card data.' },
  ];
  const defects = scenario === 'clean' ? [] : scenario === 'custom' ? custom : [scenario];

  async function start() {
    setBusy(true); setError('');
    try {
      if (scenario === 'site' && persona === 'all') {
        const t = await api('/api/site-tests', { url: siteUrl, brain });
        location.hash = `#/sites/${encodeURIComponent(t.key)}`;
        return;
      }
      const r = await api('/api/runs', scenario === 'site' ? { persona, brain, url: siteUrl } : { persona: persona === 'all' ? 'screenreader' : persona, brain, defects, goalId: persona === 'agent' ? goalId : 'checkout' });
      location.hash = `#/runs/${r.id}`;
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <div className="page">
      <p className="eyebrow">Run a test</p>
      <h1>Send a customer to buy</h1>
      <p className="lead">Pick a shop and a customer. The run streams live, step by step; the scanner checks the same pages at the end.</p>
      <a className="card own-cta" href="#/own-site">
        <span className="own-cta-k">Your own shop</span>
        <strong>Connect your site</strong>
        <span>Prove it is yours with a file or a DNS record, add one rule so your bot protection lets the test in, then send all three customers. Also checks whether AI assistants can shop there.</span>
        <span className="own-cta-go">Connect your site →</span>
      </a>
      <p className="note" style={{ marginTop: 0, marginBottom: 24 }}>{meta.paypal === 'sandbox' ? 'Payments run in the PayPal sandbox. No real money moves.' : 'Mock payments: this server makes no PayPal call.'}</p>

      <div className="grid-2">
        <section className="card" aria-labelledby="s1">
          <h2 className="section-title" id="s1"><span className="step-no">1</span>Shop to test</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {scenarios.map((s) => (
              <button key={s.id} type="button" className="choice" aria-pressed={scenario === s.id} onClick={() => { setScenario(s.id); if (s.id === 'site') setPersona('all'); else if (persona === 'all') setPersona('screenreader'); }}>
                <strong>{s.title}</strong><span>{s.note}</span>
              </button>
            ))}
          </div>
          {scenario === 'site' && (
            <div style={{ paddingTop: 12 }}>
              <label htmlFor="site-url" className="note" style={{ display: 'block', marginBottom: 6 }}>Shop address</label>
              <input id="site-url" type="url" placeholder="https://your-shop.example" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--surface)' }} />
              <p className="note">Many large shops turn automated browsers away, and AccessiPay never tries to get past that. For your own shop, <a href="#/own-site">connect it first</a>.</p>
            </div>
          )}
          {scenario === 'custom' && (
            <fieldset style={{ border: 0, padding: '10px 0 0', margin: 0 }}>
              <legend className="note">Defects to switch on</legend>
              {meta.defects.map((d) => (
                <label key={d.id} style={{ display: 'flex', gap: 8, margin: '4px 0' }}>
                  <input type="checkbox" checked={custom.includes(d.id)} onChange={(e) => setCustom(e.target.checked ? [...custom, d.id] : custom.filter((x) => x !== d.id))} />
                  <span>{d.short}{d.split === 'holdout' && <span className="tag">holdout</span>}</span>
                </label>
              ))}
            </fieldset>
          )}
        </section>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <section className="card" aria-labelledby="s2">
            <h2 className="section-title" id="s2"><span className="step-no">2</span>Who is shopping</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {scenario === 'site' && (
                <button type="button" className="choice" aria-pressed={persona === 'all'} onClick={() => setPersona('all')}>
                  <strong>All three customers</strong><span>Screen reader, keyboard-only and AI agent on the same site, as one site analysis.</span>
                </button>
              )}
              {scenario !== 'site' && Object.entries(meta.personas).map(([id, p]) => (
                <button key={id} type="button" className="choice" aria-pressed={persona === id} onClick={() => setPersona(id)}>
                  <strong>{p.label}</strong><span>{p.summary}</span>
                </button>
              ))}
            </div>
          </section>

          {persona === 'agent' && scenario !== 'site' && (
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

          <section className="card" aria-labelledby="s3">
            <h2 className="section-title" id="s3"><span className="step-no">3</span>Start</h2>
            {meta.claude ? <p className="note">Claude decides each step of the customer, live.</p> : (
              <p className="note">Live runs are switched off on this copy of AccessiPay. Every recorded run can be replayed step by step, for example <a href={`#/runs/${RUNS.agentBlocked}`}>the AI agent stopped by a Pay button that is not a real button</a> or <a href={`#/runs/${RUNS.keyboardFixed}`}>the keyboard customer paying after the fix</a>.</p>
            )}
            <p className="row" style={{ marginTop: 14 }}>
              <button type="button" className="btn primary" onClick={start} disabled={busy || !live || (scenario === 'custom' && !custom.length) || (scenario === 'site' && !/^https?:\/\/\S+\.\S+/.test(siteUrl))}>
                {busy ? 'Starting…' : 'Start test'}
              </button>
              {error && <span role="alert" className="pill bad">{error}</span>}
            </p>
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
  );
}
