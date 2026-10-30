import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import NewTest from './NewTest.jsx';
import RunView from './RunView.jsx';
import RunsGrid from './RunsGrid.jsx';
import Defects from './Defects.jsx';

function useHash() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => { setHash(location.hash || '#/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/api/meta').then(setMeta).catch((e) => setError(e.message)); }, []);

  const route = hash.replace(/^#/, '') || '/';
  const runMatch = route.match(/^\/runs\/([\w-]+)/);
  const nav = [['#/', 'New test', route === '/'], ['#/runs', 'Runs', route.startsWith('/runs')], ['#/defects', 'Defects and results', route === '/defects']];

  let page;
  if (!meta) page = <div className="page"><p className="empty">{error || 'Loading…'}</p></div>;
  else if (runMatch) page = <RunView id={runMatch[1]} meta={meta} />;
  else if (route === '/runs') page = <RunsGrid meta={meta} />;
  else if (route === '/defects') page = <Defects meta={meta} />;
  else page = <NewTest meta={meta} />;

  return (
    <>
      <header className="app-header">
        <a className="logo" href="#/">
          <span className="logo-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M5 13l4 4 10-11" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          AccessiPay
        </a>
        <nav aria-label="Main">
          {nav.map(([href, label, active]) => <a key={href} href={href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>{label}</a>)}
        </nav>
        {meta && (
          <div className="header-right">
            <span className={`pill ${meta.paypal === 'sandbox' ? 'ok' : 'warn'}`}>PayPal {meta.paypal === 'sandbox' ? 'sandbox' : 'mock'}</span>
            <span className={`pill ${meta.claude ? 'ok' : 'muted'}`}>Claude API {meta.claude ? 'on' : 'off'}</span>
          </div>
        )}
      </header>
      <main>{page}</main>
    </>
  );
}
