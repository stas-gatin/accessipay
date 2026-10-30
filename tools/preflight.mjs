// Checks real sites before any run: robots.txt, then one page load in a normal browser to see
// whether a bot check is in the way. One request per site, nothing is clicked or typed.
//   node tools/preflight.mjs <url> [url ...]
import { chromium } from 'playwright';
import { checkRobots, detectBotWall } from '../server/engine/preflight.mjs';

const urls = process.argv.slice(2);
if (!urls.length) { console.log('usage: node tools/preflight.mjs <url> [url ...]'); process.exit(1); }

const browser = await chromium.launch();
for (const url of urls) {
  const robots = await checkRobots(url);
  if (!robots.ok) { console.log(`NOT TESTABLE  ${url}  ${robots.reason}`); continue; }
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  let status = null;
  try {
    const res = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    status = res?.status() ?? null;
    await page.waitForTimeout(2500);
    const wall = status >= 400 ? `HTTP ${status}` : await detectBotWall(page);
    const title = (await page.title()).slice(0, 60);
    const skips = robots.crawlerSkips?.length ? `  (robots.txt asks crawlers to skip ${robots.crawlerSkips.join(', ')})` : '';
    console.log(`${wall ? 'NOT TESTABLE' : 'OK          '}  ${url}  HTTP ${status}  "${title}"${wall ? `  ${wall}` : ''}${skips}`);
  } catch (e) {
    console.log(`UNREACHABLE   ${url}  ${e.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
}
await browser.close();
