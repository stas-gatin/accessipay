// Real-site safety: robots.txt rules and bot-check detection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { parseRobots, robotsAllows, checkRobots, detectBotWall } from '../server/engine/preflight.mjs';
import { anonymize } from '../server/anonymize.mjs';

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
    // A bot check inside an iframe, with a normal page title on top.
    await page.setContent('<title>Shop: Expect more</title><iframe srcdoc="<h2>Quick verification</h2><p>Press &amp; hold to confirm you are a human (and not a bot).</p><button></button>"></iframe>');
    await page.waitForTimeout(200);
    assert.match(await detectBotWall(page), /bot check/);
    await page.setContent('<title>Shop</title><h1>We are working on it.</h1><p>System maintenance is in progress.</p>');
    assert.match(await detectBotWall(page), /maintenance/);
    // A hidden bot-score frame (as Shopify checkouts load) is not a wall either.
    await page.route('https://newassets.hcaptcha.com/**', (r) => r.fulfill({ body: '<p>score</p>', contentType: 'text/html' }));
    await page.setContent('<title>Checkout</title><h1>Checkout</h1><label>Email <input></label><iframe src="https://newassets.hcaptcha.com/captcha/v1/x/static/hcaptcha.html" style="width:0;height:0;border:0"></iframe>');
    await page.waitForTimeout(300);
    assert.equal(await detectBotWall(page), null);
    // The invisible reCAPTCHA badge on a normal checkout is not a wall.
    await page.setContent('<title>Checkout</title><h1>Checkout</h1><label>Email <input></label><div class="grecaptcha-badge"></div>');
    assert.equal(await detectBotWall(page), null);
    await page.setContent('<title>Rain jackets</title><h1>Rain jackets</h1><p>Light, packable, fully taped seams.</p><button>Add to bag</button>');
    assert.equal(await detectBotWall(page), null);
  } finally {
    await browser.close();
  }
});

test('anonymize replaces the host and brand words in values, never in keys', () => {
  const run = { site: { host: 'www.acmeco.com', url: 'https://www.acmeco.com/' }, events: [{ type: 'target', url: 'https://acmeco.com/cart', text: 'Acmeco bag (2) #AcmecoOnYou @acmecousa', image: 's.jpg' }] };
  const out = anonymize(run, 'Retailer A', ['Acmeco']);
  assert.deepEqual(out.site, { url: null, host: 'Retailer A', anonymized: true });
  assert.equal(out.events[0].type, 'target');
  assert.equal(out.events[0].url, null);
  // Brand words go first; what is left of a coined name (AOnYou, ausa) is not ordinary English, so it is withheld too.
  assert.equal(out.events[0].text, 'Retailer A bag (2) #Retailer [name] @Retailer [name]');
  assert.equal(out.events[0].image, undefined);
  assert.doesNotMatch(JSON.stringify(out), /acmeco/i);
});

test('short brand words are replaced at the start of a word, any capitals; two-letter words stay', () => {
  const run = { site: { host: 'www.acme-run.example', url: 'https://www.acme-run.example/' }, events: [{ type: 'act', result: 'Continue to Acme Running checkout, confirm on the next page; ZestLOOP and Kora pens; opera stays' }] };
  const out = anonymize(run, 'Retailer R', ['Acme Running', 'On', 'on', 'Zest', 'KORA', 'PERA']);
  assert.equal(out.events[0].result, 'Continue to Retailer R checkout, confirm on the next page; Retailer [name] and Retailer R pens; opera stays');
});

test('coined product names of a withheld shop are replaced, ordinary words and page text are not kept or stay', async () => {
  const { redactNames } = await import('../server/anonymize.mjs');
  assert.equal(redactNames('Many Zorbie Hoops are announced as Add to Bag', 'Retailer AJ'), 'Many [name] Hoops are announced as Add to Bag');
  assert.equal(redactNames('Cookies Settings, Opens the preference center dialog', 'Retailer AJ'), 'Cookies Settings, Opens the preference center dialog');
  assert.equal(redactNames('PayPal and Klarna buttons have no name; Shift+Tab moved focus to Retailer AJ', 'Retailer AJ'), 'PayPal and Klarna buttons have no name; Shift+Tab moved focus to Retailer AJ');
  const out = anonymize({ site: { host: 'shop.example', url: 'https://shop.example/' }, events: [{ type: 'observe', url: 'https://shop.example/products/zorbie-hoops', path: '/products/zorbie-hoops', title: 'Zorbie Hoops | Shop', text: 'heading "Zorbie Hoops"' }] }, 'Retailer AJ');
  assert.deepEqual([out.events[0].url, out.events[0].path, out.events[0].title], [null, '/products/…', 'Shop page']);
  assert.doesNotMatch(JSON.stringify(out), /zorbie/i);
});

test('live runs on a listed retailer are shown under its label', async () => {
  const { createMask } = await import('../server/anonymize.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mask-'));
  fs.mkdirSync(path.join(dir, 'private'));
  fs.writeFileSync(path.join(dir, 'private', 'sites.json'), JSON.stringify({ retailers: [{ label: 'Retailer Z', url: 'https://www.acmeshop.com', brand: 'Acme Shop' }] }));
  const mask = createMask(dir);
  const run = { id: 'x', site: { url: 'https://www.acmeshop.com/', host: 'www.acmeshop.com' }, findings: [{ problem: 'The Acme Shop logo link on acmeshop.com has no name' }], events: [{ image: 'a.jpg' }] };
  const out = mask(run);
  assert.equal(out.site.host, 'Retailer Z');
  assert.equal(out.site.url, null);
  assert.doesNotMatch(JSON.stringify(out), /acme/i);
  assert.equal(out.events[0].image, undefined);
  const other = { id: 'y', site: { url: 'https://shop.example/', host: 'shop.example' } };
  assert.equal(mask(other), other);
  assert.equal(mask({ id: 'z', site: null }).id, 'z');
});
