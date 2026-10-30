// One shopper run: observe -> decide -> act until the order is confirmed by the oracle,
// the brain stops, the loop repeats itself, or the step budget runs out.
// Every event carries a timestamp; screenshots are kept for the console and the demo video.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Session } from './session.mjs';
import AxeBuilder from '@axe-core/playwright';
import { performance } from 'node:perf_hooks';
import { stageOfPage } from '../../shared/stages.js';
import { detectBotWall } from './preflight.mjs';
import { splitByFrame } from '../scan/axe.mjs';

// Hosts that take payment data. On real sites nothing but reading may be sent to them.
const PAYMENT_HOSTS = /(^|\.)(stripe\.com|stripe\.network|paypal\.com|paypalobjects\.com|braintreegateway\.com|braintree-api\.com|adyen\.com|adyenpayments\.com|checkout\.com|shopifycs\.com|klarna\.com|affirm\.com|squareup\.com|authorize\.net)$/i;
// Real sites: at least this long between two actions, so a run never looks like a burst of traffic.
export const EXTERNAL_PAUSE_MS = 3000;
const FAILED = /did not work|There is no|cannot take keyboard focus|not available|Nothing was typed|Not allowed/;

function keysFor(d) {
  const a = d.args || {};
  if (['next', 'prev', 'activate', 'press'].includes(d.action)) return 1;
  if (d.action === 'type') return String(a.text ?? '').length + 1;
  if (d.action === 'jump') return 2;
  return 0;
}

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

export async function runShopper({ browser, startUrl, persona, brain, goal, maxSteps = 40, oracle, onEvent, shotsDir, signal, external = false }) {
  const emit = (e) => onEvent?.({ t: new Date().toISOString(), ...e });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  if (external) {
    page.setDefaultNavigationTimeout(30000);
    // Network-level guard: block anything but reading to payment providers, so a payment can never be sent.
    await context.route('**/*', (route) => {
      const req = route.request();
      let host = '';
      try { host = new URL(req.url()).hostname; } catch {}
      if (req.method() !== 'GET' && req.method() !== 'HEAD' && req.method() !== 'OPTIONS' && PAYMENT_HOSTS.test(host)) {
        emit({ type: 'guard', blocked: `${req.method()} ${host}` });
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
  }
  // Real sites: a 429 on any page load, or a bot check on screen, ends the run as "not testable".
  let wall = null;
  if (external) {
    page.on('response', (res) => {
      if (res.request().isNavigationRequest() && res.request().frame() === page.mainFrame() && res.status() === 429) wall ||= 'The site answered 429 Too Many Requests.';
    });
  }
  async function walled() {
    if (!external) return null;
    if (!wall) wall = await detectBotWall(page);
    return wall;
  }
  const notTestable = (reason) => ({ status: 'not-testable', reason: `${reason} AccessiPay does not get past bot protection, so this site was not tested.` });
  const session = new Session(page, persona, { external });
  const scanned = new Map();
  // Real sites: scan each page with axe-core the moment the shopper sees it, in the same state.
  async function scanHere(url) {
    if (!external || scanned.has(url) || scanned.size >= 8) return;
    try {
      const r = await new AxeBuilder({ page }).analyze();
      const { own, embedded } = splitByFrame(r.violations);
      const v = own.reduce((s, x) => s + x.nodes, 0);
      const inFrames = embedded.reduce((s, x) => s + x.nodes, 0);
      scanned.set(url, { url, violations: v, rules: own.map((x) => x.id), embedded: inFrames, embeddedRules: embedded.map((x) => x.id) });
      emit({ type: 'scan-page', url, violations: v, rules: own.map((x) => x.id), embedded: inFrames });
    } catch { scanned.set(url, { url, violations: null, rules: [] }); }
  }
  const seen = [];
  let lastResult = '';
  let outcome = null;
  let findings = [];
  let steps = 0;

  async function shot(step) {
    if (!shotsDir) return null;
    fs.mkdirSync(shotsDir, { recursive: true });
    const file = path.join(shotsDir, `step-${String(step).padStart(3, '0')}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 60 }).catch(() => {});
    return path.basename(file);
  }

  try {
    const first = await page.goto(startUrl, { waitUntil: 'load' });
    if (external && first && first.status() >= 400) wall ||= `The site answered HTTP ${first.status()} to the first page.`;
    await page.waitForTimeout(500);
    emit({ type: 'start', persona, startUrl });

    for (let step = 1; step <= maxSteps; step++) {
      if (signal?.aborted) { outcome = { status: 'stopped', reason: 'Run stopped by the operator.' }; break; }
      const blockedBy = await walled();
      if (blockedBy) { emit({ type: 'guard', blocked: blockedBy }); outcome = notTestable(blockedBy); break; }
      if (await oracle(page)) {
        outcome = external ? { status: 'reached-payment', reason: 'Reached the payment step. Stopped there: nothing was paid.' } : { status: 'purchased', reason: 'The order is confirmed by the payment oracle.' };
        // One last turn so the shopper can report what was hard, even though it succeeded.
        if (step > 1) {
          const obs = await session.observe();
          const last = await brain.decide({ persona, goal, observation: obs.text, step, maxSteps, lastResult: `${lastResult} ${external ? 'A payment form is now on screen: you have reached the payment step. Do not pay.' : 'The page now confirms your order.'} Finish: reply with action "done" and your findings.` });
          findings = last.findings || [];
          emit({ type: 'decide', step, action: 'done', args: {}, thought: last.thought, final: true });
        }
        break;
      }

      const obs = await session.observe();
      await scanHere(obs.url);
      const image = await shot(step);
      emit({ type: 'observe', step, path: obs.path, url: external ? obs.url : undefined, title: obs.title, text: obs.text, image, focus: obs.focus, stage: stageOfPage(external ? obs.url : obs.path) });
      emit({ type: 'thinking', step });
      const t0 = performance.now();

      const decision = await brain.decide({ persona, goal, observation: obs.text, lastResult, step, maxSteps });
      steps = step;
      const thinkMs = Math.round(performance.now() - t0);
      emit({ type: 'decide', step, action: decision.action, args: decision.args, thought: decision.thought, parseError: decision.parseError, thinkMs });

      if (decision.action === 'done' || decision.action === 'give_up') {
        findings = decision.findings || [];
        const ok = await oracle(page, { final: true });
        outcome = ok
          ? (external ? { status: 'reached-payment', reason: 'Reached the payment step. Stopped there: nothing was paid.' } : { status: 'purchased', reason: 'The order is confirmed by the payment oracle.' })
          : { status: 'blocked', reason: decision.action === 'done' ? (external ? 'The shopper said it reached payment, but no payment form was found.' : 'The agent said it was done, but no paid order exists.') : 'The agent gave up.', claimedDone: decision.action === 'done' };
        break;
      }

      const target = await session.locate(decision);
      if (target) {
        // If the element had to be scrolled into view, keep a screenshot that matches its box.
        let image;
        if (target.scrolled && shotsDir) {
          image = `step-${String(step).padStart(3, '0')}-t.jpg`;
          await page.screenshot({ path: path.join(shotsDir, image), type: 'jpeg', quality: 60 }).catch(() => { image = undefined; });
        }
        emit({ type: 'target', step, ...target, image });
      }
      if (external) await page.waitForTimeout(EXTERNAL_PAUSE_MS);
      const a0 = performance.now();
      lastResult = await session.act(decision);
      const actMs = Math.round(performance.now() - a0);
      emit({ type: 'act', step, result: lastResult, actMs, keys: keysFor(decision), ok: !FAILED.test(lastResult), refused: /^Not allowed/.test(lastResult) });

      // Same page state and same action over and over: the shopper is going in circles.
      seen.push(hash(obs.text + JSON.stringify([decision.action, decision.args])));
      const recent = seen.slice(-24);
      if (recent.length >= 24 && new Set(recent).size <= 4) {
        outcome = { status: 'blocked', reason: 'The shopper went in circles on the same page.' };
        break;
      }
    }

    if (!outcome) {
      outcome = (await oracle(page))
        ? (external ? { status: 'reached-payment', reason: 'Reached the payment step. Stopped there: nothing was paid.' } : { status: 'purchased', reason: 'The order is confirmed by the payment oracle.' })
        : { status: 'blocked', reason: `No purchase after ${maxSteps} steps.` };
    }
    const final = await session.observe().catch(() => ({ path: '', title: '', text: '' }));
    const image = await shot(999);
    emit({ type: 'end', outcome, findings, steps, path: final.path, url: external ? final.url : undefined, title: final.title, text: final.text, image });
    return { outcome, findings, steps, finalPath: final.path, finalTitle: final.title, pageScans: [...scanned.values()] };
  } finally {
    await context.close().catch(() => {});
  }
}
