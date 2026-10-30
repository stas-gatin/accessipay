// Real-site safety: robots.txt rules and bot-check detection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { parseRobots, robotsAllows, checkRobots, detectBotWall } from '../server/engine/preflight.mjs';
import { anonymize } from '../tools/record.mjs';

const ROBOTS = `
User-agent: *
Disallow: /checkout
Disallow: /cart
Allow: /cart/help$
Disallow: /*?q=

User-agent: AccessiPay
Disallow: /private/
`;

test('robots.txt: longest rule wins, own group replaces the * group', () => {
  const g = parseRobots(ROBOTS);
  assert.equal(robotsAllows(g, 'SomeBot', '/').allowed, true);
  assert.equal(robotsAllows(g, 'SomeBot', '/checkout/step1').allowed, false);
  assert.equal(robotsAllows(g, 'SomeBot', '/cart/help').allowed, true);
  assert.equal(robotsAllows(g, 'SomeBot', '/search?q=shoes').allowed, false);
  // A group naming AccessiPay applies instead of *: /checkout is not in it.
  assert.equal(robotsAllows(g, 'AccessiPay', '/checkout').allowed, true);
  assert.equal(robotsAllows(g, 'AccessiPay', '/private/x').allowed, false);
});

test('checkRobots stops a site that disallows the start page, and reports checkout skips', async () => {
  const fake = (body, status = 200) => async () => ({ ok: status < 400, status, text: async () => body });
  const blocked = await checkRobots('https://shop.example/', { fetchImpl: fake('User-agent: *\nDisallow: /') });
  assert.equal(blocked.ok, false);
  const ok = await checkRobots('https://shop.example/', { fetchImpl: fake('User-agent: *\nDisallow: /checkout') });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.crawlerSkips, ['/checkout']);
  const limited = await checkRobots('https://shop.example/', { fetchImpl: fake('', 429) });
  assert.equal(limited.ok, false);
  const missing = await checkRobots('https://shop.example/', { fetchImpl: fake('', 404) });
  assert.equal(missing.ok, true);
});

test('detectBotWall sees a challenge page and leaves a normal shop alone', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<title>Just a moment...</title><p>Checking your browser before accessing the site.</p>');
    assert.match(await detectBotWall(page), /bot check/);
    await page.setContent('<title>Rain jackets</title><h1>Rain jackets</h1><p>Light, packable, fully taped seams.</p><button>Add to bag</button>');
    assert.equal(await detectBotWall(page), null);
  } finally {
    await browser.close();
  }
});

test('anonymize replaces the host and brand words in values, never in keys', () => {
  const run = { site: { host: 'www.acme.com', url: 'https://www.acme.com/' }, events: [{ type: 'target', url: 'https://acme.com/cart', text: 'Acme bag (2)', image: 's.jpg' }] };
  const out = anonymize(run, 'Retailer A', ['Acme']);
  assert.deepEqual(out.site, { url: null, host: 'Retailer A', anonymized: true });
  assert.equal(out.events[0].type, 'target');
  assert.equal(out.events[0].url, 'https://retailer-a.example/cart');
  assert.equal(out.events[0].text, 'Retailer A bag (2)');
  assert.equal(out.events[0].image, undefined);
  assert.doesNotMatch(JSON.stringify(out), /acme/i);
});
