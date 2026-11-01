// Can AI assistants shop here? Reads what the site itself publishes (robots.txt rules for known AI
// agents, llms.txt, structured product data) and loads the home page once in an ordinary automated
// browser. AccessiPay never pretends to be another company's agent: it reads their rules, it does
// not send their user agents.

import { parseRobots, robotsAllows, detectBotWall } from './engine/preflight.mjs';
import { siteFromUrl } from './owners.mjs';

// Agents that act for a person who asked (they fetch a page because a user asked them to), then
// crawlers and search indexers run by the same companies.
export const AI_AGENTS = [
  { name: 'ChatGPT-User', by: 'OpenAI', kind: 'acts for a user' },
  { name: 'Claude-User', by: 'Anthropic', kind: 'acts for a user' },
  { name: 'Perplexity-User', by: 'Perplexity', kind: 'acts for a user' },
  { name: 'OAI-SearchBot', by: 'OpenAI', kind: 'search' },
  { name: 'Claude-SearchBot', by: 'Anthropic', kind: 'search' },
  { name: 'PerplexityBot', by: 'Perplexity', kind: 'search' },
  { name: 'GPTBot', by: 'OpenAI', kind: 'model training' },
  { name: 'ClaudeBot', by: 'Anthropic', kind: 'model training' },
  { name: 'Google-Extended', by: 'Google', kind: 'model training' },
  { name: 'Applebot-Extended', by: 'Apple', kind: 'model training' },
  { name: 'CCBot', by: 'Common Crawl', kind: 'model training' },
];

const UA = 'AccessiPay agent access check';

async function text(fetchImpl, url) {
  try {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': UA }, redirect: 'follow' });
    return { status: r.status, ok: r.ok, type: r.headers.get('content-type') || '', body: r.ok ? await r.text() : '' };
  } catch (e) {
    return { status: null, ok: false, type: '', body: '', error: String(e.message || e).slice(0, 100) };
  }
}

// Robots rules per agent, for the home page and for the paths a purchase needs.
export function agentRules(robotsText) {
  const groups = parseRobots(robotsText);
  return AI_AGENTS.map((a) => {
    const at = (p) => robotsAllows(groups, a.name, p);
    const home = at('/');
    return {
      ...a,
      named: home.own,
      home: home.allowed,
      products: at('/products/').allowed && at('/product/').allowed,
      cart: at('/cart').allowed,
      checkout: at('/checkout').allowed,
    };
  });
}

// schema.org data a shopping agent can read without guessing: Product and Offer (price, availability).
export function structuredData(html) {
  const blocks = [...String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const types = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      const t = v['@type'];
      (Array.isArray(t) ? t : [t]).filter(Boolean).forEach((x) => types.add(String(x)));
      Object.values(v).forEach(walk);
    }
  };
  for (const b of blocks) { try { walk(JSON.parse(b)); } catch { /* malformed block */ } }
  const microdata = /itemtype="https?:\/\/schema\.org\/(Product|Offer)"/i.test(html);
  return {
    jsonLd: blocks.length,
    types: [...types].slice(0, 12),
    product: types.has('Product') || types.has('ProductGroup') || /schema\.org\/Product"/i.test(html),
    offer: types.has('Offer') || types.has('AggregateOffer') || /schema\.org\/Offer"/i.test(html),
    microdata,
  };
}

export async function checkAgentAccess(rawUrl, { browser, fetchImpl = fetch, allowLocal = false } = {}) {
  const u = siteFromUrl(rawUrl, { allowLocal });
  const robots = await text(fetchImpl, `${u.origin}/robots.txt`);
  const llms = await text(fetchImpl, `${u.origin}/llms.txt`);
  const llmsFound = llms.ok && !/html/i.test(llms.type) && llms.body.trim().length > 0;

  // One page load in an ordinary automated browser: does the shop let it in at all?
  let automation = { status: null, wall: null, title: '' };
  let html = '';
  if (browser) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await context.newPage();
    try {
      const res = await page.goto(u.href, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);
      const status = res?.status() ?? null;
      const wall = status >= 400 ? `HTTP ${status}` : await detectBotWall(page);
      automation = { status, wall, title: (await page.title()).slice(0, 80) };
      if (!wall) html = await page.content();
    } catch (e) {
      automation = { status: null, wall: `the page did not load (${String(e.message || e).split('\n')[0].slice(0, 80)})`, title: '' };
    } finally {
      await context.close();
    }
  }

  const rules = robots.ok ? agentRules(robots.body) : AI_AGENTS.map((a) => ({ ...a, named: false, home: true, products: true, cart: true, checkout: true }));
  const userAgents = rules.filter((r) => r.kind === 'acts for a user');
  const data = html ? structuredData(html) : null;

  // Plain-language verdict: can an assistant that shops for a person get to the checkout here?
  const notes = [];
  if (automation.wall) notes.push(`An automated browser was turned away: ${automation.wall}. An AI assistant that shops in a browser is likely to meet the same wall.`);
  // Only a rule that names an agent is a decision about AI agents. "User-agent: *" rules are crawler
  // settings (keeping the checkout out of search results is common); they are reported, not counted.
  const blockedUsers = userAgents.filter((r) => r.named && (!r.home || !r.checkout));
  if (blockedUsers.length) notes.push(`robots.txt names ${blockedUsers.map((r) => r.name).join(', ')} and asks ${blockedUsers.length > 1 ? 'them' : 'it'} to stay away from ${blockedUsers.some((r) => !r.home) ? 'the whole site' : 'the checkout'}.`);
  const named = rules.filter((r) => r.named && !r.home);
  if (named.length) notes.push(`robots.txt turns away ${named.map((r) => r.name).join(', ')} by name.`);
  if (userAgents.some((r) => !r.named && !r.checkout)) notes.push('robots.txt asks every crawler (User-agent: *) to skip the checkout. That is a common search setting; agents that act for a person do not usually treat it as a ban.');
  if (data && !data.product) notes.push('The home page has no structured product data (schema.org Product), so agents have to read prices from the page text.');
  if (!llmsFound) notes.push('No llms.txt: nothing tells AI assistants where the products and policies are.');

  return {
    url: u.href, host: u.hostname, checkedAt: new Date().toISOString(),
    robots: { found: robots.ok, status: robots.status },
    agents: rules,
    llmsTxt: { found: llmsFound, status: llms.status },
    structuredData: data,
    automation,
    verdict: automation.wall ? 'closed' : blockedUsers.length ? 'restricted' : 'open',
    notes,
  };
}
