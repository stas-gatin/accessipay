// Large retailers are published only as "Retailer A" and so on. tools/record.mjs applies this to the
// recorded copy; the API applies it to live runs too, so a run in progress never shows a retailer's name.
import fs from 'node:fs';
import path from 'node:path';
import { runMetrics } from './metrics.mjs';
import { verifyFindings } from './verify.mjs';

// Replaces the site's host (with or without www) and any brand words given, in every string value
// of a run. Keys are left alone, so the record stays readable by the console.
export function anonymize(run, label, brands = []) {
  const host = run.site?.host;
  if (!host) return run;
  const bare = host.replace(/^www\./, '');
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fake = `${label.toLowerCase().replace(/\s+/g, '-')}.example`;
  const swap = (s) => brands.reduce(
    // Long brand words are replaced anywhere, so hashtags and handles (#AcmeOnYou, @acmeusa) are covered.
    // Short ones ("Zest", "KORA", "Tok") only at the start of a word, any capitals, so "ZestLOOP" and "Kora" go
    // but "opera" keeps its "pera". Words under 3 letters ("On") are ordinary words, not identifying, and stay.
    (acc, b) => (b.length < 3 ? acc : b.length >= 5 ? acc.replace(new RegExp(esc(b), 'gi'), label) : acc.replace(new RegExp(`\\b${esc(b)}`, 'gi'), label)),
    s.replace(new RegExp(`(www\\.)?${esc(bare)}`, 'gi'), fake),
  );
  const walk = (v) => (typeof v === 'string' ? swap(v) : Array.isArray(v) ? v.map(walk)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  // Effort is measured on the page text, which is not kept: measure first, on the original.
  let kept = run.metricsKept;
  if (!kept && run.status === 'finished') { try { kept = runMetrics(run); } catch { /* an unfinished record */ } }
  // So are the checks of the findings against the record of the run.
  let checks = run.checksKept;
  if (!checks && run.status === 'finished') { try { checks = verifyFindings(run); } catch { /* an unfinished record */ } }
  const out = walk(run);
  if (kept) out.metricsKept = kept;
  if (checks) out.checksKept = checks.map((c) => { if (!c) return c; const w = walk(c); return typeof w.evidence === 'string' ? { ...w, evidence: redactNames(w.evidence, label) } : w; });
  out.site = { url: null, host: label, anonymized: true };
  return withheld(out, label);
}

// Product, collection and promotion names can identify a shop as surely as its brand ("Zorbie Hoops").
// For a withheld shop: screenshots, raw page text and page URLs are dropped, and capitalised words that are
// not ordinary English (coined product names) are replaced with "[name]". Ordinary words, roles, keys and
// the payment and tech names below stay, so the findings still read as sentences.
const KEEP = new Set(['paypal', 'venmo', 'visa', 'mastercard', 'amex', 'klarna', 'afterpay', 'affirm', 'sezzle', 'stripe', 'shopify', 'apple', 'google', 'gpay',
  'amazon', 'facebook', 'instagram', 'tiktok', 'pinterest', 'youtube', 'twitter', 'onetrust', 'cookiebot', 'klaviyo', 'recaptcha', 'hcaptcha', 'cloudflare',
  'wcag', 'aria', 'axe', 'html', 'css', 'url', 'urls', 'iframe', 'iframes', 'shift', 'tab', 'tabs', 'enter', 'escape', 'esc', 'ok', 'faq', 'faqs', 'usd', 'eur', 'gbp',
  'alex', 'morgan', 'york', 'zip', 'usa', 'us', 'uk', 'eu', 'email', 'emails', 'checkout', 'login', 'signup', 'popup', 'popups', 'dropdown', 'combobox', 'listbox',
  'textbox', 'checkbox', 'checkboxes', 'navbar', 'menubar', 'sms', 'otp', 'cvv', 'cvc', 'pdp', 'plp', 'promo', 'promos', 'wishlist', 'retailer']);
let common = null;
function commonWords() {
  if (common) return common;
  common = new Set();
  try {
    for (const w of fs.readFileSync('/usr/share/dict/words', 'utf8').split('\n')) if (/^[a-z]/.test(w)) common.add(w);
  } catch { /* no word list: only brands, URLs and page text are withheld */ }
  return common;
}
const stems = (w) => [w, w.replace(/'s$/, ''), w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ies$/, 'y'), w.replace(/ed$/, ''), w.replace(/ed$/, 'e'), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/ers?$/, ''), w.replace(/ly$/, '')];
function ordinary(word, label) {
  const w = word.toLowerCase();
  if (w.length < 3 || KEEP.has(w) || label.toLowerCase().split(/\s+/).includes(w)) return true;
  const dict = commonWords();
  if (!dict.size) return true;
  return stems(w).some((x) => dict.has(x));
}
export function redactNames(text, label) {
  if (typeof text !== 'string') return text;
  // A run of capitalised words, the unusual ones become one "[name]".
  return text.replace(/\b[A-Z][\p{L}'’]*(?:[ -][A-Z][\p{L}'’]*)*/gu, (run) => {
    const words = run.split(/([ -])/);
    let changed = false;
    const outWords = words.map((w) => (/^[ -]$/.test(w) || ordinary(w.replace(/[’']/g, "'"), label) ? w : (changed = true, '\u0000')));
    if (!changed) return run;
    return outWords.join('').replace(/\u0000(?:[ -]\u0000)*/g, '[name]');
  });
}
const shortPath = (p) => { const seg = String(p || '').split(/[?#]/)[0].split('/').filter(Boolean); return seg.length ? `/${seg[0]}${seg.length > 1 ? '/…' : ''}` : '/'; };

function withheld(run, label) {
  const red = (t) => redactNames(t, label);
  for (const e of run.events || []) {
    delete e.image;
    delete e.outer;
    if ('text' in e) e.text = e.type === 'observe' || e.type === 'end' ? '(The page content of this shop is not kept.)' : red(e.text);
    if ('title' in e) e.title = 'Shop page';
    if ('url' in e) e.url = null;
    if ('path' in e) e.path = shortPath(e.path);
    if ('startUrl' in e) e.startUrl = null;
    if (e.thought) e.thought = red(e.thought);
    if (e.name) e.name = red(e.name);
    if (e.result) e.result = red(e.result);
    if (e.args) e.args = Object.fromEntries(Object.entries(e.args).map(([k, v]) => [k, typeof v === 'string' ? red(v) : v]));
    if (e.findings) e.findings = e.findings.map((f) => redFinding(f, red));
  }
  run.findings = (run.findings || []).map((f) => redFinding(f, red));
  if (run.outcome?.reason) run.outcome = { ...run.outcome, reason: red(run.outcome.reason) };
  if (run.scan?.pages) run.scan = { ...run.scan, pages: run.scan.pages.map((pg) => ({ ...pg, url: shortPath(pg.url && (() => { try { return new URL(pg.url).pathname; } catch { return pg.url; } })()) })) };
  return run;
}
// A page named after its title ("Retailer A - <slogan>") says more than the shop's name: call it a shop page.
const redFinding = (f, red) => ({ ...f, page: /Retailer [A-Z]{1,2}\b/.test(f.page || '') ? 'Shop page' : red(f.page), problem: red(f.problem), element: f.element && { ...f.element, name: red(f.element.name) } });

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return null; } };

// Reads data/private/sites.json (not committed; absent on a deployed copy, where every retailer run
// is already recorded anonymized) and returns a function that anonymizes any run on a listed retailer.
export function createMask(dataDir) {
  const file = path.join(dataDir, 'private', 'sites.json');
  let stamp = 0;
  let byHost = new Map();
  const load = () => {
    let m = 0;
    try { m = fs.statSync(file).mtimeMs; } catch { byHost = new Map(); return; }
    if (m === stamp) return;
    stamp = m;
    const list = JSON.parse(fs.readFileSync(file, 'utf8')).retailers || [];
    byHost = new Map(list.map((r) => {
      const host = hostOf(r.url);
      const brands = [r.brand, host?.replace(/^www\./, '').split('.')[0]].join(',').split(',').map((b) => b.trim()).filter(Boolean);
      return [host?.replace(/^www\./, ''), { label: r.label, brands }];
    }));
  };
  return (run) => {
    if (!run?.site?.host || run.site.anonymized) return run;
    load();
    const hit = byHost.get(run.site.host.replace(/^www\./, ''));
    return hit ? anonymize(run, hit.label, hit.brands) : run;
  };
}
