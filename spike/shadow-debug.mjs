// Debug: Tab order and reported focus with a shadow DOM cookie widget.
import { chromium } from 'playwright';
import { Session } from '../server/engine/session.mjs';
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(`<div id="host" aria-label="Cookie consent"></div><a href="#main">Skip to content</a>
  <script>const r = document.getElementById('host').attachShadow({ mode: 'open' });
  r.innerHTML = '<p>We use cookies</p><button>Decline</button><button>Accept</button>';</script>`);
for (const persona of ['keyboard', 'screenreader']) {
  const s = new Session(p, persona, {});
  for (let i = 0; i < 3; i++) {
    const r = await s.act({ action: 'next', args: {} });
    const raw = await p.evaluate(() => { let e = document.activeElement; const path = [e.tagName]; while (e && e.shadowRoot && e.shadowRoot.activeElement) { e = e.shadowRoot.activeElement; path.push(e.tagName + ':' + e.textContent); } return path.join(' > '); });
    console.log(persona, i, r, '|', raw);
  }
}
await b.close();
