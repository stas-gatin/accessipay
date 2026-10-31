// How the engine perceives and acts on real-world page patterns.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { Session, liftDialogs } from '../server/engine/session.mjs';

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

test('a visually hidden radio is chosen through its own label, as a person would', async () => {
  const page = await browser.newPage();
  await page.setContent(`<style>.sz input{position:absolute;opacity:0;width:1px;height:1px}.sz label{display:inline-block;padding:10px;border:1px solid}</style>
    <fieldset class="sz"><legend>Size</legend><span><input type="radio" name="s" id="m"><label for="m">M</label></span></fieldset>`);
  const s = new Session(page, 'agent', {});
  const r = await s.act({ action: 'check', args: { role: 'radio', name: 'M' } });
  assert.match(r, /^Checked/);
  assert.equal(await page.isChecked('#m'), true);
  await page.close();
});

test('a click blocked by an overlay says what is on top', async () => {
  const page = await browser.newPage();
  await page.setContent('<div id="promo" style="position:fixed;inset:0;background:#000a"></div><button>Buy</button>');
  const s = new Session(page, 'agent', {});
  const r = await s.act({ action: 'click', args: { role: 'button', name: 'Buy' } });
  assert.match(r, /covering it .*promo/);
  await page.close();
});

test('open dialogs are perceived first, even when the page is long', () => {
  const tree = ['- banner:', '  - link "Home"', '- main:', '  - heading "Shirts"', '- dialog "Cookies":', '  - button "Accept"', '- contentinfo'].join('\n');
  const out = liftDialogs(tree);
  assert.match(out, /^Open dialogs \(shown on top of the page\):\n- dialog "Cookies":\n {2}- button "Accept"/);
  assert.match(out, /The page:\n- banner:/);
  assert.doesNotMatch(out.split('The page:')[1], /Cookies/);
});

test('on a real site, a payment method choice at checkout counts as the payment step', async () => {
  const { reachedPayment } = await import('../server/engine/runs.mjs');
  const page = await browser.newPage();
  await page.route('https://shop.example/**', (r) => r.fulfill({ contentType: 'text/html', body: `<h1>Payment</h1>
    <fieldset><legend>Payment method</legend>
    <label><input type="radio" name="m"> PayPal</label><label><input type="radio" name="m"> Cash on delivery</label><label><input type="radio" name="m"> Bank transfer</label></fieldset>
    <button>Next</button>` }));
  await page.goto('https://shop.example/checkout/select-payment');
  assert.equal(await reachedPayment(page), true);
  await page.goto('https://shop.example/product/mug');
  assert.equal(await reachedPayment(page), false);
  await page.close();
});

test('a long country list is chosen by the start of a name, as typing would', async () => {
  const page = await browser.newPage();
  await page.setContent('<label>Country <select><option>Choose</option><option>Germany</option><option>United Kingdom</option><option>United States of America</option></select></label>');
  const s = new Session(page, 'agent', {});
  const r = await s.act({ action: 'select', args: { name: 'Country', option: 'United States' } });
  assert.match(r, /Selected "United States of America"/);
  await page.close();
});

test('focus inside a shadow DOM widget (cookie banners, overlays) is followed, not stuck on its host', async () => {
  for (const persona of ['keyboard', 'screenreader']) {
    const page = await browser.newPage();
    await page.setContent(`<div id="host" aria-label="Cookie consent"></div><a href="#main">Skip to content</a>
      <script>const r = document.getElementById('host').attachShadow({ mode: 'open' });
      r.innerHTML = '<p>We use cookies</p><button>Decline</button><button>Accept</button>';</script>`);
    const s = new Session(page, persona, {});
    const first = await s.act({ action: 'next', args: {} });
    const second = await s.act({ action: 'next', args: {} });
    assert.match(first, /Decline/, persona);
    assert.match(second, /Accept/, persona);
    await page.close();
  }
});
