// One shopper run: observe -> decide -> act until the order is confirmed by the oracle,
// the brain stops, the loop repeats itself, or the step budget runs out.
// Every event carries a timestamp; screenshots are kept for the console and the demo video.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Session } from './session.mjs';
import AxeBuilder from '@axe-core/playwright';

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

export async function runShopper({ browser, startUrl, persona, brain, goal, maxSteps = 40, oracle, onEvent, shotsDir, signal, external = false }) {
  const emit = (e) => onEvent?.({ t: new Date().toISOString(), ...e });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  if (external) page.setDefaultNavigationTimeout(30000);
  const session = new Session(page, persona, { external });
  const scanned = new Map();
  // Real sites: scan each page with axe-core the moment the shopper sees it, in the same state.
  async function scanHere(url) {
    if (!external || scanned.has(url) || scanned.size >= 8) return;
    try {
      const r = await new AxeBuilder({ page }).analyze();
      const v = r.violations.reduce((s, x) => s + x.nodes.length, 0);
      scanned.set(url, { url, violations: v, rules: r.violations.map((x) => x.id) });
      emit({ type: 'scan-page', url, violations: v, rules: r.violations.map((x) => x.id) });
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
    await page.goto(startUrl, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    emit({ type: 'start', persona, startUrl });

    for (let step = 1; step <= maxSteps; step++) {
      if (signal?.aborted) { outcome = { status: 'stopped', reason: 'Run stopped by the operator.' }; break; }
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
      emit({ type: 'observe', step, path: obs.path, url: external ? obs.url : undefined, title: obs.title, text: obs.text, image });

      const decision = await brain.decide({ persona, goal, observation: obs.text, lastResult, step, maxSteps });
      steps = step;
      emit({ type: 'decide', step, action: decision.action, args: decision.args, thought: decision.thought, parseError: decision.parseError });

      if (decision.action === 'done' || decision.action === 'give_up') {
        findings = decision.findings || [];
        const ok = await oracle(page);
        outcome = ok
          ? (external ? { status: 'reached-payment', reason: 'Reached the payment step. Stopped there: nothing was paid.' } : { status: 'purchased', reason: 'The order is confirmed by the payment oracle.' })
          : { status: 'blocked', reason: decision.action === 'done' ? (external ? 'The shopper said it reached payment, but no payment form was found.' : 'The agent said it was done, but no paid order exists.') : 'The agent gave up.', claimedDone: decision.action === 'done' };
        break;
      }

      lastResult = await session.act(decision);
      emit({ type: 'act', step, result: lastResult });

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
