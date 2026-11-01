// Owners verify their site, get an access key that only ever goes to their host; AI agent access check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOwnerSites, keyGoesTo, siteFromUrl, VERIFY_PATH, DNS_PREFIX } from '../server/owners.mjs';
import { agentRules, structuredData } from '../server/agent-access.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'accessipay-owners-'));

test('a site is verified by the file on the site', async () => {
  let served = '';
  const fetchImpl = async (url) => ({ ok: url.endsWith(VERIFY_PATH), status: url.endsWith(VERIFY_PATH) ? 200 : 404, text: async () => served });
  const owners = createOwnerSites({ dataDir: tmp(), fetchImpl, resolveTxt: async () => [] });
  const site = owners.add('https://www.shop.example/');
  assert.equal(site.verified, false);
  assert.equal(site.verifyFile.url, `https://www.shop.example${VERIFY_PATH}`);
  assert.match(site.access.key, /^[\w-]{30,}$/);
  served = 'wrong code';
  assert.equal((await owners.verify(site.id)).verified, false);
  served = `${site.verifyFile.content}\n`;
  const r = await owners.verify(site.id);
  assert.equal(r.verified, true);
  assert.equal(r.method, 'file');
});

test('a site is verified by a DNS TXT record on the domain', async () => {
  let records = [];
  const owners = createOwnerSites({ dataDir: tmp(), fetchImpl: async () => ({ ok: false, status: 404, text: async () => '' }), resolveTxt: async (name) => (name === 'shop.example' ? records : []) });
  const site = owners.add('https://www.shop.example/');
  assert.equal(site.dns.name, 'shop.example');
  assert.equal((await owners.verify(site.id)).verified, false);
  records = [['v=spf1 -all'], [DNS_PREFIX, site.verifyFile.content]];
  const r = await owners.verify(site.id);
  assert.equal(r.verified, true);
  assert.equal(r.method, 'dns');
});

test('the access key goes to the owner host and its subdomains only', () => {
  assert.equal(keyGoesTo('www.shop.example', 'www.shop.example'), true);
  assert.equal(keyGoesTo('www.shop.example', 'shop.example'), true);
  assert.equal(keyGoesTo('www.shop.example', 'checkout.shop.example'), true);
  assert.equal(keyGoesTo('www.shop.example', 'cdn.other.example'), false);
  assert.equal(keyGoesTo('www.shop.example', 'shop.example.evil.test'), false);
  assert.equal(keyGoesTo('www.shop.example', 'www.paypal.com'), false);
  assert.throws(() => siteFromUrl('http://localhost:4300/'), /not reachable/);
});

test('AI agent rules are read from robots.txt, user-triggered agents first', () => {
  const rules = agentRules('User-agent: GPTBot\nDisallow: /\n\nUser-agent: ChatGPT-User\nDisallow: /checkout\n\nUser-agent: *\nDisallow: /cart\n');
  const by = Object.fromEntries(rules.map((r) => [r.name, r]));
  assert.equal(by.GPTBot.home, false);
  assert.equal(by.GPTBot.named, true);
  assert.equal(by['ChatGPT-User'].home, true);
  assert.equal(by['ChatGPT-User'].checkout, false);
  assert.equal(by['Claude-User'].named, false);
  assert.equal(by['Claude-User'].cart, false);
  assert.equal(rules[0].kind, 'acts for a user');
});

test('structured product data is found in JSON-LD', () => {
  const html = '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Mug","offers":{"@type":"Offer","price":"12.00"}}]}</script>';
  const d = structuredData(html);
  assert.equal(d.product, true);
  assert.equal(d.offer, true);
  assert.equal(structuredData('<h1>Shop</h1>').product, false);
});
