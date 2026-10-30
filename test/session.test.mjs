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
