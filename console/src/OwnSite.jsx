import React, { useEffect, useState } from 'react';
import { api } from './api.js';

// Owners test their own shop: prove the domain is theirs, let AccessiPay's browser through their bot
// protection with an access key, then send the customers. Plus a check of how open the shop is to AI assistants.

const KEEP = 'accessipay-own-site';
const PERSONAS = [
  ['screenreader', 'Screen reader customer'],
  ['keyboard', 'Keyboard-only customer'],
  ['agent', 'AI shopping agent'],
];
const field = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)' };

function Copy({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch {} }}>
      {done ? 'Copied' : 'Copy'}<span className="sr-only"> {label}</span>
    </button>
  );
}

function Code({ children, label }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 12px' }}>
      <code className="mono" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>{children}</code>
      <Copy text={children} label={label} />
    </div>
  );
}

const Mark = ({ ok, yes = 'yes', no = 'no' }) => <span className={`dot-word ${ok ? 'ok' : 'bad'}`} style={{ color: ok ? 'var(--accent)' : 'var(--bad)', fontWeight: 600 }}>{ok ? yes : no}</span>;

export default function OwnSite({ meta }) {
  const [url, setUrl] = useState('https://');
  const [site, setSite] = useState(null);
  const [how, setHow] = useState('file');
  const [verifyResult, setVerifyResult] = useState(null);
  const [check, setCheck] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [persona, setPersona] = useState('screenreader');

  useEffect(() => {
    let id = null;
    try { id = localStorage.getItem(KEEP); } catch {}
    if (id) api(`/api/owner-sites/${id}`).then((s) => { setSite(s); setUrl(s.url); setCheck(s.lastCheck); }).catch(() => {});
  }, []);

  async function run(name, fn) {
    setBusy(name); setError('');
    try { await fn(); } catch (e) { setError(e.message); }
    setBusy('');
  }
  const add = () => run('add', async () => {
    const s = await api('/api/owner-sites', { url });
    setSite(s); setVerifyResult(null); setCheck(s.lastCheck);
    try { localStorage.setItem(KEEP, s.id); } catch {}
  });
  const verify = () => run('verify', async () => { const r = await api(`/api/owner-sites/${site.id}/verify`, {}); setVerifyResult(r); setSite(r.site); });
  const checkAccess = () => run('check', async () => setCheck(await api(`/api/owner-sites/${site.id}/check`, {})));
  const startRun = () => run('run', async () => {
    const r = await api('/api/runs', { persona, brain: meta.claude ? 'anthropic' : 'external', url: site.url, ownerSiteId: site.id });
    location.hash = `#/runs/${r.id}`;
  });

  const key = site?.access.key || '';
  const cf = `any(http.request.headers["${site?.access.header || 'x-accessipay-key'}"][*] eq "${key}")`;

  return (
    <div className="page">
      <p className="eyebrow">Your own shop</p>
      <h1>Test your own site</h1>
      <p className="lead">
        Bot protection stops automated browsers, ours too, and AccessiPay never tries to get past it. On your own shop you can let it in:
        prove the site is yours, add one rule to your bot protection, and send the customers. The protection stays on for everyone else.
      </p>

      <div className="grid-2">
        <section className="card" aria-labelledby="o1">
          <h2 className="section-title" id="o1"><span className="step-no">1</span>Your shop address</h2>
          <label htmlFor="own-url" className="note" style={{ display: 'block', marginBottom: 6 }}>Home page, or a staging copy of the shop</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="own-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} style={field} />
            <button type="button" className="btn primary" onClick={add} disabled={busy === 'add' || !/^https?:\/\/[^/]+\./.test(url)}>{site && site.url === url ? 'Saved' : 'Continue'}</button>
          </div>
          {site && <p className="note" style={{ marginTop: 10 }}>Site <b className="mono">{site.host}</b>: {site.verified ? <Mark ok yes={`verified by ${site.method === 'dns' ? 'DNS record' : 'file'}`} /> : 'not verified yet'}.</p>}
        </section>

        {site && (
          <section className="card" aria-labelledby="o2">
            <h2 className="section-title" id="o2"><span className="step-no">2</span>Prove the site is yours</h2>
            <div role="radiogroup" aria-label="How to verify" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[['file', 'A file on the site'], ['dns', 'A DNS record']].map(([id, l]) => (
                <button key={id} type="button" className="choice" role="radio" aria-checked={how === id} aria-pressed={how === id} onClick={() => setHow(id)} style={{ flex: 1 }}><strong>{l}</strong></button>
              ))}
            </div>
            {how === 'file' ? (
              <>
                <p className="note">Publish a plain-text file at this address:</p>
                <Code label="file address">{site.verifyFile.url}</Code>
                <p className="note">containing exactly this code:</p>
                <Code label="verification code">{site.verifyFile.content}</Code>
              </>
            ) : (
              <>
                <p className="note">Add a TXT record to the domain <b className="mono">{site.dns.name}</b> with this value:</p>
                <Code label="TXT record value">{site.dns.value}</Code>
                <p className="note">DNS changes can take a few minutes to an hour to show.</p>
              </>
            )}
            <button type="button" className="btn primary" onClick={verify} disabled={busy === 'verify'}>{busy === 'verify' ? 'Checking…' : 'Check verification'}</button>
            {verifyResult && (
              <ul className="note" aria-live="polite" style={{ marginTop: 10 }}>
                {verifyResult.tried.map((t) => <li key={t.method}>{t.method === 'file' ? 'File' : 'DNS record'}: <Mark ok={t.ok} yes="found" no="not yet" /> {t.ok ? '' : `(${t.detail})`}</li>)}
              </ul>
            )}
          </section>
        )}

        {site?.verified && (
          <section className="card" aria-labelledby="o3">
            <h2 className="section-title" id="o3"><span className="step-no">3</span>Let the checker through your bot protection</h2>
            <p className="note">Every request AccessiPay's browser makes to <b className="mono">{site.host}</b> (and its subdomains, nothing else) carries this header. Allow requests that carry it.</p>
            <p className="note" style={{ marginBottom: 0 }}>Header name</p>
            <Code label="header name">{site.access.header}</Code>
            <p className="note" style={{ marginBottom: 0 }}>Value, your access key. Keep it private.</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 12px' }}>
              <code className="mono" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>{showKey ? key : '•'.repeat(24)}</code>
              <button type="button" className="btn" onClick={() => setShowKey(!showKey)} aria-pressed={showKey}>{showKey ? 'Hide' : 'Show'}</button>
              <Copy text={key} label="access key" />
            </div>
            <details>
              <summary><b>Cloudflare</b></summary>
              <p className="note">Security, WAF, Custom rules, Create rule. Use “Edit expression” and paste:</p>
              <Code label="Cloudflare rule expression">{cf}</Code>
              <p className="note">Action: Skip, and tick the remaining custom rules, rate limiting rules and Super Bot Fight Mode. Place the rule first. On the free plan, Bot Fight Mode cannot be skipped by a rule: turn it off while the test runs, or test a staging copy.</p>
            </details>
            <details>
              <summary><b>Akamai</b></summary>
              <p className="note">In Bot Manager, add an exception (or a custom bot category set to Allow) whose condition is: request header <span className="mono">{site.access.header}</span> equals your key. Activate it on the property that serves the shop.</p>
            </details>
            <details>
              <summary><b>Any other firewall or CDN</b></summary>
              <p className="note">AWS WAF, Fastly, Imperva, nginx or your own rules: add an allow rule, evaluated before the bot rules, that matches the header <span className="mono">{site.access.header}</span> with your key as its exact value.</p>
            </details>
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn primary" onClick={checkAccess} disabled={busy === 'check'}>{busy === 'check' ? 'Loading your home page twice…' : 'Check access'}</button>
            </div>
            {check && (
              <ul className="note" aria-live="polite" style={{ marginTop: 10 }}>
                <li>Without the key: {check.withoutKey.wall ? <><Mark ok={false} no="stopped" /> ({check.withoutKey.wall})</> : <Mark ok yes="loads" />}</li>
                <li>With the key: {check.withKey.wall ? <><Mark ok={false} no="still stopped" /> ({check.withKey.wall}). Check that the rule is first and active.</> : <Mark ok yes="loads, ready to test" />}</li>
              </ul>
            )}
          </section>
        )}

        {site?.verified && (
          <section className="card" aria-labelledby="o4">
            <h2 className="section-title" id="o4"><span className="step-no">4</span>Send a customer</h2>
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              {PERSONAS.map(([id, l]) => (
                <button key={id} type="button" className="choice" aria-pressed={persona === id} onClick={() => setPersona(id)}><strong>{l}</strong></button>
              ))}
            </div>
            <p className="note">The customer goes as far as the payment step and stops: no order is placed and no card data is typed. On your verified site the run ignores the robots.txt rules meant for crawlers.</p>
            <button type="button" className="btn primary" onClick={startRun} disabled={busy === 'run'}>Start the test</button>
          </section>
        )}
      </div>
      {error && <p className="note" role="alert" style={{ color: 'var(--bad)', marginTop: 16 }}>{error}</p>}

      <AgentAccess initial={site?.url} />
    </div>
  );
}

const VERDICT = {
  open: ['Open to AI assistants', 'An automated browser got in and no rule turns AI assistants away.'],
  restricted: ['Partly closed to AI assistants', 'robots.txt names agents that act for a person and turns them away from part of the shop.'],
  closed: ['Closed to automated browsers', 'The shop turned an automated browser away, so an AI assistant shopping in a browser is likely to be stopped too.'],
};

// A rule that names the agent is a decision about it; a "User-agent: *" rule is a crawler setting.
function Rule({ a, k }) {
  if (a[k]) return <Mark ok yes="allowed" />;
  return a.named ? <Mark ok={false} no="disallowed by name" /> : <span className="note">all crawlers asked to skip</span>;
}

export function AgentAccess({ initial }) {
  const [url, setUrl] = useState(initial || 'https://');
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (initial) setUrl(initial); }, [initial]);
  async function go() {
    setBusy(true); setError(''); setR(null);
    try { setR(await api(`/api/agent-access?url=${encodeURIComponent(url)}`)); } catch (e) { setError(e.message); }
    setBusy(false);
  }
  return (
    <section className="card" aria-labelledby="aa" style={{ marginTop: 24 }}>
      <h2 className="section-title" id="aa">Can AI assistants shop here?</h2>
      <p className="note">Reads what the shop publishes for AI agents (robots.txt rules, llms.txt, structured product data) and loads the home page once in an ordinary automated browser. It never pretends to be another company’s agent.</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <label htmlFor="aa-url" className="sr-only">Shop address</label>
        <input id="aa-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} style={field} />
        <button type="button" className="btn primary" onClick={go} disabled={busy || !/^https?:\/\/[^/]+\./.test(url)}>{busy ? 'Checking…' : 'Check'}</button>
      </div>
      {error && <p className="note" role="alert" style={{ color: 'var(--bad)' }}>{error}</p>}
      {r && (
        <div aria-live="polite" style={{ marginTop: 16 }}>
          <p><b>{VERDICT[r.verdict][0]}.</b> <span className="note">{VERDICT[r.verdict][1]}</span></p>
          <ul className="note">
            <li>Automated browser: {r.automation.wall ? <><Mark ok={false} no="turned away" /> ({r.automation.wall})</> : <Mark ok yes={`let in (HTTP ${r.automation.status})`} />}</li>
            <li>llms.txt: <Mark ok={r.llmsTxt.found} yes="published" no="none" /></li>
            <li>Structured product data on the home page: {r.structuredData ? <Mark ok={r.structuredData.product} yes={`yes${r.structuredData.offer ? ', with prices' : ''}`} no="none" /> : 'not checked (page not loaded)'}</li>
            {r.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="data">
              <caption className="sr-only">robots.txt rules for AI agents</caption>
              <thead><tr><th scope="col">Agent</th><th scope="col">By</th><th scope="col">Purpose</th><th scope="col">Named in robots.txt</th><th scope="col">Home</th><th scope="col">Checkout</th></tr></thead>
              <tbody>
                {r.agents.map((a) => (
                  <tr key={a.name}><th scope="row" className="mono">{a.name}</th><td>{a.by}</td><td>{a.kind}</td><td>{a.named ? 'yes' : 'no'}</td><td><Rule a={a} k="home" /></td><td><Rule a={a} k="checkout" /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ marginTop: 8 }}>Only the home page is loaded. A checkout can still show a bot check later; a full customer run finds that.</p>
        </div>
      )}
    </section>
  );
}
