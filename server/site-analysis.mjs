// One analysis per site: every customer type that tried to buy there, as one report. The overall
// picture (how many customer types reached the payment step, problems they share, the scanner,
// whether AI assistants are let in) plus what each customer met, with the steps behind it.

import fs from 'node:fs';
import path from 'node:path';
import { runMetrics } from './metrics.mjs';
import { THEMES } from './analytics.mjs';
import { verifyFindings, verificationSummary } from './verify.mjs';

const PERSONAS = ['screenreader', 'keyboard', 'agent'];
const counted = (r) => r.outcome && !['error', 'stopped'].includes(r.outcome.status);
const ok = (r) => ['purchased', 'reached-payment'].includes(r.outcome?.status);

export function createSiteAnalysis({ runs, dataDir }) {
  // Real-site runs grouped by host (anonymized retailers carry their label as host).
  function groups() {
    const by = new Map();
    for (const r of runs.list()) {
      if (!r.site || r.brainKind === 'scripted') continue;
      const key = r.site.host;
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(r);
    }
    return by;
  }

  // The latest counted run of each customer type, else the latest run at all.
  function latestByPersona(list) {
    const out = {};
    for (const p of PERSONAS) {
      const mine = list.filter((r) => r.persona === p).sort((a, b) => (a.id < b.id ? 1 : -1));
      out[p] = mine.find((r) => r.status === 'finished' && counted(r)) || mine[0] || null;
    }
    return out;
  }

  function summaryOf(key, list) {
    const latest = latestByPersona(list);
    const tried = Object.values(latest).filter(Boolean);
    const done = tried.filter((r) => r.status === 'finished' && counted(r));
    const testable = done.filter((r) => r.outcome.status !== 'not-testable');
    return {
      key,
      kind: /^Retailer /.test(key) ? 'retailer' : 'platform',
      anonymized: list.some((r) => r.site?.anonymized),
      url: list.find((r) => r.site?.url)?.site.url || null,
      lastRun: list.map((r) => r.createdAt).sort().at(-1),
      running: list.filter((r) => r.status === 'running').length,
      customers: Object.fromEntries(PERSONAS.map((p) => [p, latest[p] && { id: latest[p].id, status: latest[p].status, outcome: latest[p].outcome?.status || null, steps: latest[p].steps ?? null }])),
      tested: testable.length,
      reached: testable.filter(ok).length,
      notTestable: done.some((r) => r.outcome.status === 'not-testable') && !testable.length,
    };
  }

  // Most complete analyses first: more customer types tested, then more of them reaching payment.
  function list() {
    return [...groups()].map(([key, l]) => summaryOf(key, l))
      .sort((a, b) => b.tested - a.tested || b.reached - a.reached || a.key.localeCompare(b.key, 'en', { numeric: true }));
  }

  function agentAccess(key) {
    const file = path.join(dataDir, 'agent-access', `${key.replace(/[^\w.-]/g, '_')}.json`);
    if (!fs.existsSync(file)) return null;
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  }

  function get(key) {
    const l = groups().get(key);
    if (!l) return null;
    const summary = summaryOf(key, l);
    const latest = latestByPersona(l);
    const customers = PERSONAS.map((p) => {
      const brief = latest[p];
      if (!brief) return { persona: p, run: null, metrics: null, scan: null, findings: [], earlier: [] };
      const run = runs.get(brief.id);
      const m = run.status === 'finished' ? runMetrics(run) : null;
      const final = [...(run.events || [])].reverse().find((e) => e.type === 'decide' && (e.action === 'give_up' || e.action === 'done'));
      return {
        persona: p,
        run: { id: run.id, status: run.status, createdAt: run.createdAt, outcome: run.outcome, reason: final?.thought || null },
        metrics: m && { steps: m.steps, keys: m.keys, tabs: m.tabs, deadEnds: m.deadEnds, noEffect: m.noEffect, klmSeconds: m.klmSeconds, furthestStage: m.furthestStage, stepsPerStage: m.stepsPerStage },
        scan: run.scan ? { violations: run.scan.totalViolations, pages: run.scan.pages?.length || 0, rules: [...new Set((run.scan.pages || []).flatMap((pg) => pg.rules || []))] } : null,
        findings: (() => { const checks = run.status === 'finished' ? verifyFindings(run) : []; return (run.findings || []).map((f, i) => ({ ...f, runId: run.id, check: checks[i] || null })); })(),
        earlier: l.filter((r) => r.persona === p && r.id !== run.id).map((r) => ({ id: r.id, outcome: r.outcome?.status || r.status })),
      };
    });

    // Problems more than one customer type met, by theme.
    const themes = THEMES.map(([theme, re]) => {
      const hits = customers.flatMap((c) => c.findings.filter((f) => re.test(`${f.page || ''} ${f.problem || ''} ${f.element?.name || ''}`)).map((f) => ({ ...f, persona: c.persona })));
      return { theme, count: hits.length, personas: [...new Set(hits.map((h) => h.persona))], examples: hits.slice(0, 3) };
    }).filter((t) => t.count).sort((a, b) => b.personas.length - a.personas.length || b.count - a.count);

    const scans = customers.map((c) => c.scan).filter(Boolean);
    return {
      ...summary,
      customers,
      themes,
      scanner: scans.length ? { violations: Math.max(...scans.map((s) => s.violations ?? 0)), pages: Math.max(...scans.map((s) => s.pages)), rules: [...new Set(scans.flatMap((s) => s.rules))] } : null,
      findings: customers.reduce((t, c) => t + c.findings.length, 0),
      checks: verificationSummary(customers.flatMap((c) => c.findings.map((f) => f.check).filter(Boolean))),
      agentAccess: agentAccess(key),
    };
  }

  return { list, get };
}
