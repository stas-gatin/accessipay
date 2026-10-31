// Screenshots of every hero replay frame, to check that each ring sits on its element.
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await p.goto('http://127.0.0.1:4300/#/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const n = Number((await p.locator('.rp-count').innerText()).split('/')[1]);
for (let i = 0; i < n; i++) {
  await p.waitForTimeout(700);
  await p.locator('.rp-screen').screenshot({ path: `${out}/frame-${i + 1}.png` });
  console.log(i + 1, (await p.locator('.rp-step').innerText()), '|', (await p.locator('.rp-line').innerText()).slice(0, 90));
  await p.getByRole('button', { name: 'Next frame' }).click();
}
await b.close();
