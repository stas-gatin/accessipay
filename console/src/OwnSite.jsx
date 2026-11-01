import React, { useEffect, useState } from 'react';
import { api } from './api.js';

// Owners test their own shop: prove the domain is theirs, let AccessiPay's browser through their bot
// protection with an access key, then send the customers. Plus a check of how open any shop is to AI assistants.

const KEEP = 'accessipay-own-site';
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

function Locked({ n, title, after }) {
  return (
    <section className="card own-locked" aria-label={`Step ${n}: ${title}, ${typeof after === 'number' ? `opens after step ${after}` : `opens once ${after}`}`}>
      <h2 className="section-title"><span className="step-no">{n}</span>{title}</h2>
      <p className="note">{typeof after === 'number' ? `Opens after step ${after}.` : `Opens once ${after}.`}</p>
    </section>
  );
}

// The owner's steps, shown on the Run a test page when a real shop is the owner's own.
// With `fixedUrl` the address was already entered and checked above, so the address step is skipped.
export function OwnShopSteps({ meta, fixedUrl = null, first = 2 }) {
  const [url, setUrl] = useState(fixedUrl || 'https://');
  const [site, setSite] = useState(null);
  // Same switch as the other start buttons: without a Claude API key the console does not start live runs.
  const live = meta.claude || /[?&]agent=1\b/.test(location.search);
  const at = fixedUrl ? first - 1 : first; // the number of the address step, real or skipped
  const [how, setHow] = useState('file');
  const [verifyResult, setVerifyResult] = useState(null);
  const [check, setCheck] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [sbx, setSbx] = useState({ url: '', clientId: '', secret: '' });
  const [pay, setPay] = useState(false);

  useEffect(() => {
    if (fixedUrl) return;
    let id = null;
    try { id = localStorage.getItem(KEEP); } catch {}
    if (id) api(`/api/owner-sites/${id}`).then((s) => { setSite(s); setUrl(s.url); setCheck(s.lastCheck); }).catch(() => {});
  }, []);

  async function run(name, fn) {
    setBusy(name); setError('');
    try { await fn(); } catch (e) { setError(e.message); }
    setBusy('');
  }
  const add = (to = fixedUrl || url) => run('add', async () => {
    const s = await api('/api/owner-sites', { url: to });
    setSite(s); setVerifyResult(null); setCheck(s.lastCheck);
    try { localStorage.setItem(KEEP, s.id); } catch {}
  });
  useEffect(() => { if (fixedUrl) { setUrl(fixedUrl); add(); } }, [fixedUrl]);
  const verify = () => run('verify', async () => { const r = await api(`/api/owner-sites/${site.id}/verify`, {}); setVerifyResult(r); setSite(r.site); });
  const checkAccess = () => run('check', async () => setCheck(await api(`/api/owner-sites/${site.id}/check`, {})));
  const connect = () => run('sandbox', async () => {
    const s = await api(`/api/owner-sites/${site.id}/sandbox`, { url: sbx.url || site.url, clientId: sbx.clientId, secret: sbx.secret });
    setSite(s); setSbx({ url: '', clientId: '', secret: '' }); setPay(true);
  });
  const disconnect = () => run('sandbox', async () => {
    const r = await fetch(`/api/owner-sites/${site.id}/sandbox`, { method: 'DELETE' });
    setSite(await r.json()); setPay(false);
  });
  // With a sandbox connected, paying is the default: that is what the owner connected it for.
  useEffect(() => { setPay(!!site?.sandbox); }, [!!site?.sandbox]);
  const paying = pay && !!site?.sandbox;
  const startRun = () => run('run', async () => {
    const brain = meta.claude ? 'anthropic' : 'external';
    // Every shop is always tested by all three customers, as one site analysis.
    const t = await api('/api/site-tests', paying
      ? { url: site.sandbox.url, brain, ownerSiteId: site.id, payInSandbox: true }
      : { url: site.url, brain, ownerSiteId: site.id });
    location.hash = `#/sites/${encodeURIComponent(t.key)}`;
  });

  const key = site?.access.key || '';
  const cf = `any(http.request.headers["${site?.access.header || 'x-accessipay-key'}"][*] eq "${key}")`;

  return (
    <>
      <p className="note" style={{ marginTop: 0 }}>
        Bot protection stops automated browsers, ours too, and AccessiPay never tries to get past it. On your own shop you can let it in:
        prove the site is yours, add one rule to your bot protection, and send the customers. The protection stays on for everyone else.
      </p>
      <div className="own-steps">
        {!fixedUrl && <section className="card" aria-labelledby="o1">
          <h2 className="section-title" id="o1"><span className="step-no">{first}</span>Your shop address</h2>
          <label htmlFor="own-url" className="note" style={{ display: 'block', marginBottom: 6 }}>Home page, or a staging copy of the shop</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="own-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} style={field} />
            <button type="button" className="btn primary" onClick={() => add(url)} disabled={busy === 'add' || !/^https?:\/\/[^/]+\./.test(url)}>{site && site.url === url ? 'Saved' : 'Continue'}</button>
          </div>
          {site && <p className="note" style={{ marginTop: 10 }}>Site <b className="mono">{site.host}</b>: {site.verified ? <Mark ok yes={`verified by ${site.method === 'dns' ? 'DNS record' : 'file'}`} /> : 'not verified yet'}.</p>}
        </section>}

        {!site && <Locked n={at + 1} title="Prove the site is yours" after={fixedUrl ? 'the shop is added' : at} />}
        {site && (
          <section className="card" aria-labelledby="o2">
            <h2 className="section-title" id="o2"><span className="step-no">{at + 1}</span>Prove the site is yours</h2>
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

        {!site?.verified && <Locked n={at + 2} title="Let the test through your bot protection" after={at + 1} />}
        {site?.verified && (
          <section className="card" aria-labelledby="o3">
            <h2 className="section-title" id="o3"><span className="step-no">{at + 2}</span>Let the test through your bot protection</h2>
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

        {!site?.verified && <Locked n={at + 3} title="Optional: pay in your PayPal sandbox" after={at + 1} />}
        {site?.verified && (
          <section className="card" aria-labelledby="o-sbx">
            <h2 className="section-title" id="o-sbx"><span className="step-no">{at + 3}</span>Optional: pay in your PayPal sandbox</h2>
            <p>Reaching the payment page does not prove a customer can pay. Connect a staging copy of your shop that takes payments in the PayPal sandbox, and the customers go all the way: they pay with a PayPal test card, and a test passes only when <b>your own sandbox</b> reports the order as COMPLETED.</p>
            {site.sandbox ? (
              <>
                <p className="note" aria-live="polite"><Mark ok yes="Connected" />: sandbox app <span className="mono">…{site.sandbox.clientId.slice(-6)}</span>, checkout <span className="mono">{site.sandbox.url}</span>.</p>
                <button type="button" className="btn" onClick={disconnect} disabled={busy === 'sandbox'}>Disconnect</button>
              </>
            ) : (
              <>
                <label htmlFor="sbx-url" className="note" style={{ display: 'block', margin: '8px 0 4px' }}>Staging checkout address, on {site.host.replace(/^www\./, '')} or a subdomain</label>
                <input id="sbx-url" type="url" value={sbx.url} placeholder={site.url} onChange={(e) => setSbx({ ...sbx, url: e.target.value })} style={field} />
                <label htmlFor="sbx-id" className="note" style={{ display: 'block', margin: '10px 0 4px' }}>Sandbox app Client ID</label>
                <input id="sbx-id" value={sbx.clientId} autoComplete="off" spellCheck={false} onChange={(e) => setSbx({ ...sbx, clientId: e.target.value })} style={field} />
                <label htmlFor="sbx-secret" className="note" style={{ display: 'block', margin: '10px 0 4px' }}>Sandbox app Secret</label>
                <input id="sbx-secret" type="password" value={sbx.secret} autoComplete="off" onChange={(e) => setSbx({ ...sbx, secret: e.target.value })} style={field} />
                <p className="note">From developer.paypal.com, Apps &amp; Credentials, Sandbox. Live keys are refused. The keys are used only to read your orders back, and the Secret is never shown again. During the test, the browser may send a payment only to a PayPal checkout loaded with this Client ID; every other payment request is blocked.</p>
                <button type="button" className="btn primary" onClick={connect} disabled={busy === 'sandbox' || !sbx.clientId || !sbx.secret}>{busy === 'sandbox' ? 'Asking PayPal…' : 'Connect sandbox'}</button>
              </>
            )}
          </section>
        )}

        {!site?.verified && <Locked n={at + 4} title="Send the three customers" after={at + 2} />}
        {site?.verified && (
          <section className="card" aria-labelledby="o4">
            <h2 className="section-title" id="o4"><span className="step-no">{at + 4}</span>Send the three customers</h2>
            <p>A screen reader user, a keyboard-only user and an AI shopping agent shop at the same time. Their results come together as one analysis of your shop.</p>
            {site.sandbox && (
              <div role="radiogroup" aria-label="How far the customers go" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[[false, 'Stop at the payment step', site.url], [true, 'Pay in my PayPal sandbox', site.sandbox.url]].map(([v, l, u]) => (
                  <button key={l} type="button" className="choice" role="radio" aria-checked={pay === v} aria-pressed={pay === v} onClick={() => setPay(v)} style={{ flex: 1 }}><strong>{l}</strong><span className="note mono" style={{ display: 'block' }}>{u}</span></button>
                ))}
              </div>
            )}
            <p className="note">{paying
              ? 'Each customer buys one product and pays with a PayPal test card on your staging checkout. No real money moves. A run counts as paid only when your PayPal sandbox reports the order as COMPLETED.'
              : 'Each customer goes as far as the payment step and stops: no order is placed and no card data is typed.'} On your verified site the rules meant for search crawlers (robots.txt) are not applied, because you asked for the test.</p>
            {!live && <p className="note">Starting new tests is turned off in this public demo: each run has an AI model decide every step, and that has a cost.</p>}
            <button type="button" className="btn primary" onClick={startRun} disabled={busy === 'run' || !live}>{busy === 'run' ? 'Starting…' : 'Start the test'}</button>
          </section>
        )}
      </div>
      {error && <p className="note" role="alert" style={{ color: 'var(--bad)', marginTop: 16 }}>{error}</p>}
    </>
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

// What a real shop tells AI assistants, and whether it let an automated browser in: shown on Run a test
// as soon as a real shop's address is checked.
export function AgentAccessResult({ r }) {
  return (
    <div aria-live="polite">
      <p><b>{VERDICT[r.verdict][0]}.</b> <span className="note">{VERDICT[r.verdict][1]}</span></p>
      <ul className="note">
        <li>Automated browser: {r.automation.wall ? <><Mark ok={false} no="turned away" /> ({r.automation.wall})</> : <Mark ok yes={`let in (HTTP ${r.automation.status})`} />}</li>
        <li>llms.txt: <Mark ok={r.llmsTxt.found} yes="published" no="none" /></li>
        <li>Structured product data on the home page: {r.structuredData ? <Mark ok={r.structuredData.product} yes={`yes${r.structuredData.offer ? ', with prices' : ''}`} no="none" /> : 'not checked (page not loaded)'}</li>
        {r.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>
      <details>
        <summary className="note">robots.txt rules for AI agents</summary>
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
      </details>
    </div>
  );
}
