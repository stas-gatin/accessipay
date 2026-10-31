// Shop owners test their own site. The owner proves control of the domain (a file on the site or a
// DNS TXT record), then gets an access key. One rule in their bot protection lets requests that carry
// the key through, so AccessiPay's browser reaches the checkout while the protection stays on for
// everyone else. The key is only ever sent to the owner's own host.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';

export const VERIFY_PATH = '/.well-known/accessipay.txt';
export const KEY_HEADER = 'x-accessipay-key';
export const DNS_PREFIX = 'accessipay-verification=';

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?|169\.254\.)|\.local$|\.internal$/i;

export function siteFromUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new Error('Enter the full address of your shop, starting with https://'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https sites can be tested');
  if (PRIVATE_HOST.test(u.hostname)) throw new Error('This address is not reachable from the internet');
  return u;
}

// The key travels to the verified host and its subdomains (www, shop, checkout), never anywhere else.
export function keyGoesTo(siteHost, requestHost) {
  const base = siteHost.replace(/^www\./, '');
  return requestHost === siteHost || requestHost === base || requestHost.endsWith(`.${base}`);
}

export function createOwnerSites({ dataDir, fetchImpl = fetch, resolveTxt = dns.resolveTxt }) {
  const dir = path.join(dataDir, 'owners');
  fs.mkdirSync(dir, { recursive: true });
  const sites = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    sites.set(s.id, s);
  }
  const save = (s) => fs.writeFileSync(path.join(dir, `${s.id}.json`), JSON.stringify(s, null, 2));

  // What the owner sees: how to verify and how to let the browser in.
  function view(s) {
    return {
      id: s.id, url: s.url, host: s.host, verified: s.verified, method: s.method || null, verifiedAt: s.verifiedAt || null,
      verifyFile: { url: `${s.origin}${VERIFY_PATH}`, content: s.token },
      dns: { name: s.host.replace(/^www\./, ''), type: 'TXT', value: `${DNS_PREFIX}${s.token}` },
      access: { header: KEY_HEADER, key: s.key },
      lastCheck: s.lastCheck || null,
    };
  }

  function add(rawUrl) {
    const u = siteFromUrl(rawUrl);
    const existing = [...sites.values()].find((s) => s.host === u.hostname);
    if (existing) return view(existing);
    const s = {
      id: crypto.randomBytes(8).toString('hex'),
      url: u.href, origin: u.origin, host: u.hostname,
      token: crypto.randomBytes(16).toString('hex'),
      key: crypto.randomBytes(24).toString('base64url'),
      verified: false, createdAt: new Date().toISOString(),
    };
    sites.set(s.id, s);
    save(s);
    return view(s);
  }

  async function verify(id) {
    const s = sites.get(id);
    if (!s) throw new Error('Site not found');
    const tried = [];
    // 1. The file on the site.
    try {
      const r = await fetchImpl(`${s.origin}${VERIFY_PATH}`, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'AccessiPay site verification' } });
      const text = r.ok ? (await r.text()).trim() : '';
      tried.push({ method: 'file', ok: text.includes(s.token), detail: r.ok ? (text ? 'the file was found but holds a different code' : 'the file is empty') : `HTTP ${r.status}` });
    } catch (e) {
      tried.push({ method: 'file', ok: false, detail: `could not fetch the file (${String(e.message || e).slice(0, 80)})` });
    }
    // 2. The DNS record, on the domain and on the exact host.
    if (!tried[0].ok) {
      const names = [...new Set([s.host.replace(/^www\./, ''), s.host])];
      let found = false;
      const seen = [];
      for (const name of names) {
        try {
          const records = (await resolveTxt(name)).map((parts) => parts.join(''));
          seen.push(...records);
          if (records.some((r) => r.trim() === `${DNS_PREFIX}${s.token}`)) { found = true; break; }
        } catch { /* no TXT records */ }
      }
      tried.push({ method: 'dns', ok: found, detail: found ? 'record found' : seen.length ? 'TXT records exist, none with this code yet' : 'no TXT record yet (DNS changes can take a while)' });
    }
    const ok = tried.find((t) => t.ok);
    if (ok) Object.assign(s, { verified: true, method: ok.method, verifiedAt: new Date().toISOString() });
    save(s);
    return { verified: s.verified, method: ok?.method || null, tried, site: view(s) };
  }

  function get(id) { const s = sites.get(id); return s ? view(s) : null; }
  function raw(id) { return sites.get(id) || null; }
  function recordCheck(id, check) { const s = sites.get(id); if (s) { s.lastCheck = check; save(s); } }

  return { add, verify, get, raw, recordCheck };
}
