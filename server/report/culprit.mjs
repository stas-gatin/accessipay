// Finds the element where the customer got stuck, its box on a screenshot, and what axe-core flagged
// on the same screen. Priority (engineer.md 2a, step 2):
// 1. Demo shop run with a fix: the elements the accepted patches changed, located on the page rendered
//    again without the fix, in a throwaway browser context with the same cart state. Exact, no AI.
// 2. Blocked run without a fix: a failed or missing target, or the focus loop (from recorded boxes,
//    or, for older demo-shop runs, by rendering the page again).
// 3. Real site: findings that carry a step and an element, and the recorded target and focus boxes.
//    Older real-site runs have no positions: the finding is placed on the screenshot of its page.

import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { PAGE_PATHS } from '../shop/instances.mjs';
import { stuckPage } from '../fixer/fixer.mjs';
import { payPage } from '../shop/pages.mjs';

const require = createRequire(import.meta.url);
export const AXE_VERSION = (() => { try { return require('axe-core/package.json').version; } catch { return 'unknown'; } })();
export const VIEWPORT = { width: 1280, height: 860 };
const CULPRIT_VERSION = 4;
const FAILED = /did not work|There is no|cannot take keyboard focus|not available|Nothing was typed/;

// The cart and shipping state of a customer who has reached payment. Same values as the axe scan.
export function checkoutState() {
  return {
    cart: [{ sku: 'bp-01', name: 'Trail Backpack', price: 49, qty: 1 }],
    coupon: '',
    shipping: { name: 'Alex Morgan', email: 'alex.morgan@example.com', street: '12 Market Street', city: 'Springfield', zip: '62701', country: 'US', delivery: 'standard' },
    order: null,
  };
}

// The shop's payment page moved to PayPal's own card fields. Runs recorded before that saw the shop's
// own form; their payment page is rebuilt from the same template without the PayPal SDK.
export function usedPayPalSdk(run) {
  const text = (run.events || []).filter((e) => e.type === 'observe' && /\/pay$/.test(e.path || '')).map((e) => e.text).join('\n');
  return /Pay with PayPal|Or pay by card|iframe/i.test(text);
}

// The HTML of a page as this run's customer got it (defects on, the instance's patches, if any).
export function renderAsCustomerGot({ shop, run, inst, page, base }) {
  if (page === 'pay' && run && !run.site && !usedPayPalSdk(run)) {
    const has = (d) => inst.defects.includes(d);
    let html = payPage({ base, has, mode: run.paypalMode || 'sandbox', cart: inst.cart, coupon: inst.coupon, shipping: inst.shipping, totals: shop.totals(inst), order: inst.order, cartCount: inst.cart.reduce((s, l) => s + l.qty, 0) });
    for (const p of (inst.patches || []).filter((x) => x.page === page)) if (html.split(p.find).length === 2) html = html.replace(p.find, () => p.replace);
    return html;
  }
  return shop.render(inst, page, base);
}

const decode = (s) => String(s).replace(/&times;/g, '×').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

// The most specific opening tag in a patch's `find`: one with an id, else one with a class, else the first.
export function tagOf(find) {
  const tags = [];
  const re = /<([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
  let m;
  while ((m = re.exec(String(find || '')))) {
    const attrs = {};
    for (const a of m[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    const after = String(find).slice(m.index + m[0].length);
    const text = decode((after.match(/^([^<]{1,80})/) || [, ''])[1]).trim();
    tags.push({ tag: m[1].toLowerCase(), id: attrs.id || '', cls: attrs.class || '', text, open: m[0] });
  }
  if (!tags.length) return null;
  return tags.find((t) => t.id) || tags.find((t) => t.cls) || tags.find((t) => t.text) || tags[0];
}

export function selectorOf(t) {
  if (!t) return '';
  if (t.id) return `#${t.id}`;
  if (t.cls) return `${t.tag}.${t.cls.trim().split(/\s+/).join('.')}`;
  return t.text ? `${t.tag} (text "${t.text}")` : t.tag;
}

// Image size from the file header (JPEG or PNG), so marks use the screenshot's own pixels.
export function imageSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  } catch {}
  return { ...VIEWPORT };
}

const union = (boxes) => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
};
const contains = (a, b) => a.x <= b.x + 1 && a.y <= b.y + 1 && a.x + a.width >= b.x + b.width - 1 && a.y + a.height >= b.y + b.height - 1;
const clipBox = (b, W, H) => {
  if (!b) return null;
  const x = Math.max(0, b.x);
  const y = Math.max(0, b.y);
  const w = Math.min(W, b.x + b.width) - x;
  const h = Math.min(H, b.y + b.height) - y;
  return w > 2 && h > 2 ? { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) } : null;
};

// Where a run's step images live and the URL they are served under.
export function stepImage(dataDir, run, image) {
  if (!image) return null;
  for (const dir of [path.join(dataDir, 'runs', run.id), path.join(dataDir, 'recorded', run.id)]) {
    const file = path.join(dir, image);
    if (fs.existsSync(file)) return { file, url: `/runs-data/${run.id}/${image}`, ...imageSize(file), origin: 'step' };
  }
  return null;
}

// What role and name the markup gives an element, and whether Tab can reach it.
function describeInPage(el) {
  const tag = el.tagName.toLowerCase();
  const implicit = { button: 'button', a: el.hasAttribute('href') ? 'link' : '', select: 'combobox', textarea: 'textbox', dialog: 'dialog', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', nav: 'navigation', main: 'main', form: 'form', ul: 'list', ol: 'list', li: 'listitem', img: 'img' };
  let role = el.getAttribute('role') || implicit[tag] || '';
  if (tag === 'input') {
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    role = el.getAttribute('role') || ({ checkbox: 'checkbox', radio: 'radio', submit: 'button', button: 'button', number: 'spinbutton', hidden: '' }[t] ?? 'textbox');
  }
  const byId = (ids) => ids.split(/\s+/).map((i) => document.getElementById(i)?.textContent || '').join(' ');
  const label = el.labels && el.labels[0] ? el.labels[0].textContent : '';
  const name = (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') ? byId(el.getAttribute('aria-labelledby')) : '') || label || (['div', 'span', 'button', 'a', 'h1', 'h2', 'h3', 'p', 'li'].includes(tag) ? el.textContent : '') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const focusable = el.tabIndex >= 0 && !el.disabled && !el.closest('[inert],[aria-hidden="true"]');
  const cs = getComputedStyle(el);
  return { tag, role, name, focusable, fixed: cs.position === 'fixed', outer: el.outerHTML.replace(/ data-ap-culprit="\d+"/, '').replace(/\s+/g, ' ').slice(0, 300) };
}

// Renders a demo-shop page as the customer got it (defects on, no fix, same cart) and runs finders on it.
// finders: [{ n, kind: 'patch', find, patchId } | { n, kind: 'text', text, notRole } | { n, kind: 'overlay' }]
export async function renderAndLocate({ shop, browser, origin, run = null, defects, page: pageName, finders, outFile }) {
  const inst = shop.create({ defects });
  Object.assign(inst, checkoutState());
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    // The document itself is the page as this run's customer got it; everything else is the live shop.
    const docUrl = `${origin}/s/${inst.id}${PAGE_PATHS[pageName] || '/'}`;
    const html = renderAsCustomerGot({ shop, run, inst, page: pageName, base: `/s/${inst.id}` });
    await page.route(docUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto(`${origin}/s/${inst.id}${PAGE_PATHS[pageName] || '/'}`, { waitUntil: 'load' });
    await page.waitForTimeout(900);

    // Scanner first, on the untouched page.
    let scan = null;
    try {
      const r = await new AxeBuilder({ page }).analyze();
      scan = r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => n.target) }));
    } catch (e) { scan = { error: String(e.message || e).split('\n')[0] }; }

    const found = [];
    for (const f of finders) {
      const ok = await page.evaluate(({ f, tag }) => {
        const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
        const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
        let el = null;
        if (f.kind === 'patch' && tag) {
          let els = tag.id ? [document.getElementById(tag.id)].filter(Boolean) : [...document.getElementsByTagName(tag.tag)];
          if (!tag.id && tag.cls) {
            const want = tag.cls.trim().split(/\s+/);
            const exact = els.filter((e) => want.every((c) => e.classList.contains(c)) && e.classList.length === want.length);
            els = exact.length ? exact : els.filter((e) => want.every((c) => e.classList.contains(c)));
          }
          if (tag.text) { const t = els.filter((e) => e.textContent.replace(/\s+/g, ' ').trim().startsWith(tag.text)); if (t.length) els = t; }
          el = els.find(visible) || null;
        } else if (f.kind === 'text') {
          const all = [...document.body.querySelectorAll('*')].filter((e) => visible(e) && e.textContent.replace(/\s+/g, ' ').trim() === f.text);
          // The innermost element with exactly that text, that is not already a proper control.
          el = all.filter((e) => ![...e.children].some((c) => all.includes(c))).find((e) => !e.matches('button, a[href], input, select, [role=button], [role=link]')) || null;
        } else if (f.kind === 'overlay') {
          const dialogs = [...document.querySelectorAll('[role=dialog],[role=alertdialog],dialog[open],[aria-modal=true]')].filter(visible);
          if (dialogs.length) el = dialogs[0];
          else {
            const vw = innerWidth * innerHeight;
            const fixed = [...document.body.querySelectorAll('*')].filter((e) => visible(e) && getComputedStyle(e).position === 'fixed' && area(e) > 4000);
            el = fixed.at(-1) || null;
            // A full-screen backdrop: take the box inside it that holds the content.
            while (el && area(el) > vw * 0.8) {
              const kids = [...el.children].filter(visible).sort((a, b) => area(b) - area(a));
              if (!kids.length) break;
              el = kids[0];
            }
          }
        }
        if (!el) return false;
        el.setAttribute('data-ap-culprit', String(f.n));
        return true;
      }, { f, tag: f.kind === 'patch' ? tagOf(f.find) : null });
      if (ok) found.push(f);
    }

    // Bring the first element into view, then measure everything on that one screen.
    const firstSel = found.length ? `[data-ap-culprit="${found[0].n}"]` : null;
    if (firstSel) await page.locator(firstSel).first().scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(150);
    const elements = [];
    for (const f of found) {
      const loc = page.locator(`[data-ap-culprit="${f.n}"]`).first();
      const raw = await loc.boundingBox().catch(() => null);
      const info = await loc.evaluate(describeInPage).catch(() => null);
      if (!info) continue;
      const scannerRules = Array.isArray(scan) ? await page.evaluate(({ scan, n }) => {
        const c = document.querySelector(`[data-ap-culprit="${n}"]`);
        const hits = [];
        for (const v of scan) for (const t of v.targets) {
          if (t.length !== 1) continue;
          let el = null;
          try { el = document.querySelector(t[0]); } catch {}
          if (el && c && (el === c || el.contains(c) || c.contains(el))) { hits.push(v.id); break; }
        }
        return hits;
      }, { scan, n: f.n }) : [];
      elements.push({ n: f.n, kind: f.kind, patchId: f.patchId || null, selector: f.kind === 'patch' ? selectorOf(tagOf(f.find)) : f.kind === 'text' ? `text "${f.text}"` : 'popup or dialog', ...info, box: clipBox(raw, VIEWPORT.width, VIEWPORT.height), scannerRules });
    }
    const scannerBoxes = [];
    if (Array.isArray(scan)) {
      for (const v of scan) for (const t of v.targets) {
        if (t.length !== 1) continue;
        const b = await page.locator(t[0]).first().boundingBox().catch(() => null);
        const c = clipBox(b, VIEWPORT.width, VIEWPORT.height);
        if (c) scannerBoxes.push({ rule: v.id, box: c });
      }
    }
    if (outFile) {
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      await page.screenshot({ path: outFile, type: 'png' });
    }
    return { elements, scan: Array.isArray(scan) ? scan.map(({ targets, ...v }) => ({ ...v, selectors: targets.map((t) => t.join(' >> ')) })) : [], scanError: Array.isArray(scan) ? null : scan?.error, scannerBoxes };
  } finally {
    await context.close().catch(() => {});
    shop.forget?.(inst.id);
  }
}

// Steps on the page where the customer ended up, and the loop it was in, if any.
export function stuckEvidence(run) {
  const ev = run.events || [];
  const observes = ev.filter((e) => e.type === 'observe');
  const last = observes.at(-1);
  const where = (o) => (run.site ? o.title : o.path);
  const onPage = [];
  for (let i = observes.length - 1; i >= 0 && where(observes[i]) === where(last); i--) onPage.unshift(observes[i].step);
  const acts = ev.filter((e) => e.type === 'act' && onPage.includes(e.step));
  const decides = ev.filter((e) => e.type === 'decide' && onPage.includes(e.step));
  const failed = acts.filter((a) => a.ok === false || FAILED.test(a.result || ''));
  const moved = acts.map((a) => (String(a.result || '').match(/^Focus moved to: (.*)$/s) || [])[1]).filter(Boolean);
  const distinct = [...new Set(moved)];
  const loop = moved.length >= 4 && distinct.length <= 3 ? { stops: distinct, moves: moved.length } : null;
  return { steps: onPage, first: onPage[0], last: onPage.at(-1), acts, decides, failed, loop, lastObserve: last };
}

// Case 1: demo shop with a fix.
async function fromFix({ run, fix, shop, browser, origin, filesDir }) {
  const finders = (fix.accepted || []).map((p, i) => ({ n: i + 1, kind: 'patch', find: p.find, patchId: p.id })).filter((f) => tagOf(f.find));
  const file = path.join(filesDir, `culprit-${run.id}-${fix.id}.png`);
  const r = await renderAndLocate({ shop, browser, origin, run, defects: run.defects || [], page: fix.page, finders, outFile: file });
  // The first located element is the culprit; elements that contain it are context; others are listed.
  const located = r.elements.filter((e) => e.box);
  const primary = located[0] || null;
  for (const e of r.elements) e.role_in_report = e === primary ? 'primary' : (primary && e.box && contains(e.box, primary.box) ? 'container' : 'changed');
  return {
    source: 'fix', confidence: 'Confirmed in DOM', page: fix.page, path: PAGE_PATHS[fix.page],
    image: { file, url: `/report/files/${path.basename(file)}`, ...VIEWPORT, origin: 'rerender' },
    elements: r.elements, primary: primary && primary.n, scan: r.scan, scanError: r.scanError, scannerBoxes: r.scannerBoxes,
    note: 'Rendered again without the fix, with the same cart and shipping details the customer had.',
  };
}

// Case 2: blocked run without a fix.
async function fromRun({ run, shop, browser, origin, dataDir, filesDir }) {
  const ev = run.events || [];
  const stuck = stuckEvidence(run);
  const targets = ev.filter((e) => e.type === 'target' && stuck.steps.includes(e.step));
  const failedSteps = new Set(stuck.failed.map((a) => a.step));
  const failedTarget = [...targets].reverse().find((t) => failedSteps.has(t.step)) || [...targets].reverse().find((t) => t.missing);
  const obsOf = (step) => ev.find((e) => e.type === 'observe' && e.step === step);

  // A target that was found but did not work: its box is on that step's screenshot.
  if (failedTarget && !failedTarget.missing && failedTarget.box) {
    const img = stepImage(dataDir, run, failedTarget.image || obsOf(failedTarget.step)?.image);
    if (img) return { source: 'target', confidence: 'Recorded during the run', page: run.site ? stuck.lastObserve?.title : stuckPage(run), step: failedTarget.step, image: img, elements: [{ n: 1, kind: 'target', selector: failedTarget.role ? `${failedTarget.role} "${failedTarget.name || ''}"` : 'focused element', tag: failedTarget.tag, outer: failedTarget.outer, role: failedTarget.role, name: failedTarget.name, box: failedTarget.box, role_in_report: 'primary' }], primary: 1, scan: null, scannerBoxes: [] };
  }

  // A focus loop with recorded focus boxes: circle the area the focus kept cycling through.
  const focusBoxes = stuck.steps.map((s) => obsOf(s)?.focus).filter(Boolean);
  if (stuck.loop && focusBoxes.length >= 4) {
    const box = union(focusBoxes);
    const img = stepImage(dataDir, run, obsOf(stuck.last)?.image);
    if (img) return { source: 'loop', confidence: 'Recorded during the run', page: run.site ? stuck.lastObserve?.title : stuckPage(run), step: stuck.last, image: img, elements: [{ n: 1, kind: 'loop', selector: `focus loop: ${stuck.loop.stops.join(' / ')}`, box, role_in_report: 'primary' }], primary: 1, scan: null, scannerBoxes: [], loop: stuck.loop };
  }

  // Demo shop: render the page again and find the element (missing control by its text, or the popup).
  if (!run.site && shop && browser) {
    const finders = [];
    const missing = failedTarget?.missing ? failedTarget : null;
    // Older runs have no target events: the failed action's own role and name tell what was missing.
    const failedDecide = [...stuck.failed].reverse().map((a) => stuck.decides.find((d) => d.step === a.step)).find((d) => d?.args?.name);
    const fromText = missing?.name || failedDecide?.args.name || (stuck.failed.map((a) => (String(a.result).match(/There is no \w+ named "([^"]+)"/) || [])[1]).find(Boolean));
    const missingRole = missing?.role || failedDecide?.args.role || null;
    if (fromText) finders.push({ n: 1, kind: 'text', text: fromText });
    if (stuck.loop) finders.push({ n: finders.length + 1, kind: 'overlay' });
    if (finders.length) {
      const page = stuckPage(run);
      const file = path.join(filesDir, `culprit-${run.id}-run.png`);
      const r = await renderAndLocate({ shop, browser, origin, run, defects: run.defects || [], page, finders, outFile: file });
      const located = r.elements.filter((e) => e.box);
      if (located.length) {
        located[0].role_in_report = 'primary';
        for (const e of r.elements.slice(1)) e.role_in_report = 'changed';
        return { source: fromText ? 'missing' : 'loop', confidence: 'Confirmed in DOM', page, path: PAGE_PATHS[page], image: { file, url: `/report/files/${path.basename(file)}`, ...VIEWPORT, origin: 'rerender' }, elements: r.elements, primary: located[0].n, scan: r.scan, scanError: r.scanError, scannerBoxes: r.scannerBoxes, loop: stuck.loop, missing: fromText ? { role: missingRole, name: fromText } : null, note: 'Rendered again with the same defects and cart; the run itself has no recorded element positions.' };
      }
    }
  }

  // Nothing located: the last screenshot, with the finding placed but no circle.
  const img = stepImage(dataDir, run, obsOf(stuck.last)?.image);
  return { source: 'none', confidence: 'Agent-reported, not yet confirmed', page: run.site ? stuck.lastObserve?.title : stuckPage(run), step: stuck.last, image: img, elements: [], primary: null, scan: null, scannerBoxes: [], loop: stuck.loop };
}

// Boxes from a step's accessibility snapshot file (`- button "Pay" [box=x,y,w,h]`), if it was saved.
function boxFromAria(dataDir, run, step, el) {
  if (!el?.name) return null;
  const name = `step-${String(step).padStart(3, '0')}.aria.txt`;
  for (const dir of [path.join(dataDir, 'runs', run.id), path.join(dataDir, 'recorded', run.id)]) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/-\s+(\w+)\s+"([^"]*)".*\[box=(-?\d+),(-?\d+),(\d+),(\d+)\]/);
      if (m && m[2] === el.name && (!el.role || el.role === m[1])) return { x: +m[3], y: +m[4], width: +m[5], height: +m[6] };
    }
  }
  return null;
}

// Case 3: real site. One located place per finding.
export function siteCulprits({ run, dataDir }) {
  const ev = run.events || [];
  const observes = ev.filter((e) => e.type === 'observe');
  const words = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) || []);
  return (run.findings || []).map((f, i) => {
    let step = Number.isInteger(f.step) ? f.step : null;
    if (step == null) {
      // Older findings name only the page: choose the step of that page whose perceived text shares
      // the most words with the finding.
      const same = observes.filter((o) => o.title === f.page);
      const want = words(f.problem);
      let best = same[0];
      let score = -1;
      for (const o of same) {
        const have = words(o.text);
        const s = [...want].filter((w) => have.has(w)).length;
        if (s > score) { score = s; best = o; }
      }
      step = best?.step ?? null;
    }
    const obs = observes.find((o) => o.step === step);
    let box = null;
    let source = 'finding';
    if (f.element) {
      const target = ev.find((e) => e.type === 'target' && e.step === step && e.box && (!f.element.name || e.name === f.element.name));
      box = target?.box || boxFromAria(dataDir, run, step, f.element);
      if (box) source = target ? 'target' : 'aria';
    }
    const img = obs ? stepImage(dataDir, run, ev.find((e) => e.type === 'target' && e.step === step && e.image && box)?.image || obs.image) : null;
    return { index: i, step, image: img, box, source, confidence: box ? 'Recorded during the run' : 'Agent-reported, not yet confirmed', element: f.element || null, url: obs?.url || null, title: obs?.title || f.page };
  });
}

// Entry point with a disk cache (one JSON per run and fix) and in-flight de-duplication.
const inflight = new Map();
export async function findCulprit({ run, fix = null, shop, browser, origin, dataDir }) {
  const dir = path.join(dataDir, 'reports', 'culprits');
  const filesDir = path.join(dataDir, 'reports', 'files');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(filesDir, { recursive: true });
  const key = `${run.id}-${fix ? fix.id : 'run'}`;
  const cacheFile = path.join(dir, `${key}.json`);
  if (fs.existsSync(cacheFile)) {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (c.version === CULPRIT_VERSION && (!c.image?.file || fs.existsSync(c.image.file))) return c;
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const r = fix && fix.accepted?.length && !run.site
      ? await fromFix({ run, fix, shop, browser, origin, filesDir })
      : await fromRun({ run, shop, browser, origin, dataDir, filesDir });
    const out = { version: CULPRIT_VERSION, runId: run.id, fixId: fix?.id || null, axeVersion: AXE_VERSION, createdAt: new Date().toISOString(), ...r };
    fs.writeFileSync(cacheFile, JSON.stringify(out, null, 2));
    return out;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
