import React, { useEffect, useState } from 'react';
import { api, OUTCOME, shortDate } from './api.js';

const BRAINS = [
  { id: 'anthropic', label: 'Claude API', note: 'Runs live. Each step is one Claude request.' },
  { id: 'external', label: 'Claude Code agent', note: 'An agent drives the run from tools/agent.mjs.' },
];

export default function NewTest({ meta }) {
  const train = meta.defects.filter((d) => d.split === 'train');
  const [scenario, setScenario] = useState('focus-trap-modal');
  const [custom, setCustom] = useState([]);
  const [persona, setPersona] = useState('screenreader');
  const [brain, setBrain] = useState(meta.claude ? 'anthropic' : 'external');
  const [goalId, setGoalId] = useState('checkout');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);

  useEffect(() => { api('/api/runs').then((r) => setRecent(r.slice(0, 8))).catch(() => {}); }, []);
  const proof = recent.find((r) => r.outcome?.status === 'blocked' && r.scan?.totalViolations === 0 && r.defects?.length && !r.patches?.length);

  const scenarios = [
    { id: 'clean', title: 'Clean shop', note: 'No defects. The control: every customer should be able to buy.' },
    ...train.map((d) => ({ id: d.id, title: d.short, note: `${d.title}. ${d.page[0].toUpperCase() + d.page.slice(1)} page.` })),
    { id: 'custom', title: 'Pick defects', note: 'Any mix, including the holdout set.' },
  ];
  const defects = scenario === 'clean' ? [] : scenario === 'custom' ? custom : [scenario];

  async function start() {
    setBusy(true); setError('');
    try {
      const r = await api('/api/runs', { persona, brain, defects, goalId: persona === 'agent' ? goalId : 'checkout' });
      location.hash = `#/runs/${r.id}`;
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <div className="page">
      <p className="eyebrow">Console</p>
      <h1>Run a test</h1>
      <p className="lead">Pick a shop, a customer and who decides each step. The run streams live; the scanner checks the same pages at the end.</p>

      <div className="grid-2">
        <section className="card" aria-labelledby="s1">
          <h2 className="section-title" id="s1"><span className="step-no">1</span>Shop to test</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {scenarios.map((s) => (
              <button key={s.id} type="button" className="choice" aria-pressed={scenario === s.id} onClick={() => setScenario(s.id)}>
                <strong>{s.title}</strong><span>{s.note}</span>
              </button>
            ))}
          </div>
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

          <section className="card" aria-labelledby="s3">
            <h2 className="section-title" id="s3"><span className="step-no">3</span>Who decides each step</h2>
            <div className="grid-2">
              {BRAINS.filter((b) => meta.brains.includes(b.id)).map((b) => (
                <button key={b.id} type="button" className="choice" aria-pressed={brain === b.id} onClick={() => setBrain(b.id)} disabled={b.id === 'anthropic' && !meta.claude} title={b.id === 'anthropic' && !meta.claude ? 'No Claude API key on the server yet' : undefined}>
                  <strong>{b.label}</strong><span>{b.note}</span>
                </button>
              ))}
            </div>
            {brain === 'external' && <p className="note">After you start, run <code>node tools/agent.mjs turn &lt;run id&gt;</code> and let a Claude Code agent decide each step.</p>}
            <p className="row" style={{ marginTop: 14 }}>
              <button type="button" className="btn primary" onClick={start} disabled={busy || (scenario === 'custom' && !custom.length)}>
                {busy ? 'Starting…' : 'Start test'}
              </button>
              {error && <span role="alert" className="pill bad">{error}</span>}
            </p>
          </section>

          <section className="card" aria-labelledby="s4">
            <h2 className="section-title" id="s4">Recent runs</h2>
            {recent.length === 0 ? <p className="note">No runs yet.</p> : (
              <ul className="findings" style={{ listStyle: 'none', padding: 0 }}>
                {recent.map((r) => (
                  <li key={r.id} className="row">
                    <a href={`#/runs/${r.id}`}>{meta.personas[r.persona]?.label}, {r.defects.length ? r.defects.map((id) => meta.defects.find((d) => d.id === id)?.short || id).join(', ') : 'clean shop'}{r.patches?.length ? ', after the fix' : ''}</a>
                    <span className={`pill ${OUTCOME[r.outcome?.status]?.tone || 'muted'}`}>{OUTCOME[r.outcome?.status]?.label || r.status}</span>
                    <span className="note">{shortDate(r.createdAt)}{r.recorded ? ' · recorded' : ''}</span>
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
