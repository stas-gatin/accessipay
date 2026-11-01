// Premise check, no AI involved: a rule scanner says "clean", yet the page is not usable
// through the accessibility tree. Run: npm run spike
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const store = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../store/checkout.html');
const browser = await chromium.launch();

for (const variant of ['broken', 'fixed']) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`file://${store}?v=${variant}`);

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const tree = await page.locator('body').ariaSnapshot();

  const payButton = await page.getByRole('button', { name: 'Pay now' }).count();
  const applyButton = await page.getByRole('button', { name: /apply coupon/i }).count();
  const namedJustButton = await page.getByRole('button', { name: 'button', exact: true }).count();

  console.log(`\n===== variant: ${variant} =====`);
  console.log(`axe violations: ${axe.violations.length}`, axe.violations.map((v) => v.id));
  console.log(`"Pay now" reachable as a button: ${payButton > 0}`);
  console.log(`"Apply coupon" reachable as a button: ${applyButton > 0}`);
  console.log(`buttons whose name is just "button": ${namedJustButton}`);
  console.log('accessibility tree:\n' + tree);
  await context.close();
}
await browser.close();
