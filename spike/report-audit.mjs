// Audits the owner reports: axe-core on each report page (screen and print media, desktop and phone
// width), horizontal overflow, and the PDF (tagged structure tree and outline present).
// Run with the server up: node spike/report-audit.mjs [baseUrl]
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.argv[2] || process.env.ACCESSIPAY_URL || 'http://127.0.0.1:4300';
const REPORTS = (process.env.REPORTS || 'case/20261030-ee0cff,case/20261030-003839,site/20261030-82bb98,site/20261030-ac71b0,site/20261030-f7ff60,run/20261030-a47d5d,run/20261030-302c0f').split(',');
const browser = await chromium.launch();
let problems = 0;
for (const [w, h, media] of [[1280, 900, 'screen'], [390, 844, 'screen'], [1000, 1400, 'print']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  for (const r of REPORTS) {
    const res = await page.goto(`${BASE}/report/${r}${media === 'print' ? '?print=1' : ''}`, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media });
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const bad = axe.violations.length || overflow || res.status() !== 200;
    if (bad) problems += 1;
    console.log(`${String(w).padStart(4)}px ${media.padEnd(6)} ${r.padEnd(26)} http=${res.status()} axe=${axe.violations.map((v) => `${v.id}(${v.nodes.length})`).join(',') || 'none'} overflow=${overflow}`);
    for (const v of axe.violations) console.log(`   - ${v.id}: ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }
  await ctx.close();
}
for (const r of REPORTS.slice(0, Number(process.env.PDFS || 3))) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/report/${r}.pdf`);
  const buf = Buffer.from(await res.arrayBuffer());
  const s = buf.toString('latin1');
  const tagged = s.includes('/StructTreeRoot') && s.includes('/MarkInfo');
  const outline = s.includes('/Outlines');
  const lang = /\/Lang\s*\(/.test(s);
  if (!res.ok || !tagged || !outline) problems += 1;
  console.log(`PDF ${r.padEnd(26)} http=${res.status} ${Math.round(buf.length / 1024)} KB tagged=${tagged} outline=${outline} lang=${lang} ${Date.now() - t0} ms`);
}
await browser.close();
console.log(problems ? `${problems} problem(s)` : 'All report pages pass axe-core, no overflow; PDFs are tagged with an outline.');
process.exit(problems ? 1 : 0);
