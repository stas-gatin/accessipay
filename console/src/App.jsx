import React, { useEffect, useRef, useState } from 'react';
import { useAutoReveal } from './autoreveal.js';
import { api } from './api.js';
import { ThemeContext, initialTheme, applyTheme } from './theme.js';
import NewTest from './NewTest.jsx';
import OwnSite from './OwnSite.jsx';
import Results from './SiteReport.jsx';
import RunView from './RunView.jsx';
import Landing from './Landing.jsx';
import Analytics from './Analytics.jsx';
import Report from './Report.jsx';
import Logo from './Logo.jsx';
import { MethodPage, CustomersPage, PayPalPage } from './site/pages.jsx';
import { SiteFooter } from './site/blocks.jsx';
import './landing.css';

// Routes live in the hash and always start with "#/". Any other hash ("#owner") is an in-page anchor:
// the router ignores it so the browser can scroll to the section.
function useHash() {
  const read = () => (location.hash.startsWith('#/') ? location.hash : '#/');
  const [hash, setHash] = useState(read);
  useEffect(() => {
    const on = () => {
      if (location.hash && !location.hash.startsWith('#/')) return;
      setHash(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

const SITE_ROUTES = new Set(['/', '/method', '/customers', '/paypal']);

export default function App() {
  const hash = useHash();
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(initialTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => { api('/api/meta').then(setMeta).catch((e) => setError(e.message)); }, []);
  useEffect(() => { setMenuOpen(false); }, [hash]);

  const route = hash.replace(/^#/, '') || '/';
  const mainRef = useRef(null);
  useAutoReveal(mainRef, route);
  const runMatch = route.match(/^\/runs\/([\w-]+)/);
  // A run or a report belongs to Results (a real shop) or to Analytics (the demo shop); the page says which once it has loaded.
  const [section, setSection] = useState(null);
  useEffect(() => { setSection(null); }, [route]);
  const nav = [
    ['#/', 'Overview', route === '/'],
    ['#/method', 'Method', route === '/method' || route === '/honesty' || route === '/defects'],
    ['#/customers', 'Customers', route === '/customers'],
    ['#/paypal', 'For PayPal', route === '/paypal'],
    // Results holds every real-shop analysis. A single run or report opens from Results or Analytics; its breadcrumb says which.
    ['#/results', 'Results', route.startsWith('/sites') || route === '/results' || route === '/runs' || section === 'results'],
    ['#/analytics', 'Analytics', route === '/analytics' || section === 'analytics'],
    ['#/own-site', 'Your site', route === '/own-site'],
  ];

  let page;
  if (route === '/method') page = <MethodPage />;
  else if (route === '/customers') page = <CustomersPage />;
  else if (route === '/paypal') page = <PayPalPage />;
  else if (route === '/honesty') page = <MethodPage />; // the limits are the last section of the Method page
  else if (!meta) page = <div className="page"><p className="empty">{error || 'Loading…'}</p></div>;
  else if (runMatch) page = <RunView id={runMatch[1]} meta={meta} onSection={setSection} />;
  else if (/^\/report\/(run|case|site)\/[\w-]+$/.test(route)) page = <Report route={route} meta={meta} onSection={setSection} />;
  else if (route === '/runs') page = <Results />;
  else if (route === '/defects') page = <MethodPage />;
  else if (route === '/test') page = <NewTest meta={meta} />;
  else if (route === '/own-site') page = <OwnSite meta={meta} />;
  else if (route === '/sites' || route === '/results') page = <Results />;
  else if (/^\/sites\/.+/.test(route)) page = <Results siteKey={decodeURIComponent(route.slice(7))} />;
  else if (route === '/analytics') page = <Analytics meta={meta} />;
  else page = <Landing meta={meta} />;

  return (
    <ThemeContext.Provider value={theme}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <header className={`app-header site-header${SITE_ROUTES.has(route) ? ' on-site' : ''}${menuOpen ? ' menu-open' : ''}`}>
        <a className="logo" href="#/" aria-label="AccessiPay, home">
          <Logo size={34} draw />
        </a>
        <button type="button" className="menu-btn" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen(!menuOpen)}>
          <span className="menu-ico" aria-hidden="true"><i /><i /><i /></span>Menu
        </button>
        <nav id="main-nav" aria-label="Main">
          {nav.map(([href, label, active]) => <a key={href} href={href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>{label}</a>)}
          <a href="#/test" className={`nav-mobile-only${route === '/test' ? ' active' : ''}`} aria-current={route === '/test' ? 'page' : undefined}>Run a test</a>
        </nav>
        <div className="header-right">
          <button type="button" className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}>
            <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span><span className="tt-label" aria-hidden="true">{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
          </button>
          <a className={`header-cta${route === '/test' ? ' active' : ''}`} href="#/test" aria-current={route === '/test' ? 'page' : undefined}>Run a test</a>
        </div>
      </header>
      <main id="main" tabIndex={-1} ref={mainRef}><div key={route} className="route-in">{page}</div></main>
      <div className="lp"><SiteFooter /></div>
    </ThemeContext.Provider>
  );
}
