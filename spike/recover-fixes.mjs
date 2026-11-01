// One-off: rebuild fix records lost in a server restart from the fixer replies and the saved patches.
import fs from 'node:fs';
import path from 'node:path';
import { createTwoFilesPatch } from 'diff';
import { createShop } from '../server/shop/instances.mjs';
import { createPayPal } from '../server/paypal/client.mjs';

const SP = process.argv[2];
const shop = createShop({ paypal: createPayPal({}), dataDir: 'data' });
for (const [fixId, runId, replyFile] of [['9cbe79de', '20261030-003839', 'fix-reply-003839.json'], ['7ab82852', '20261030-ee0cff', 'fix-reply-ee0cff.json']]) {
  const run = JSON.parse(fs.readFileSync(`data/runs/${runId}.json`, 'utf8'));
  const inst = shop.get(run.instanceId);
  const reply = JSON.parse(fs.readFileSync(path.join(SP, replyFile), 'utf8'));
  const page = inst.patches[0].page;
  const base = `/s/${inst.id}`;
  const before = shop.renderUnpatched(inst, page, base);
  const after = shop.render(inst, page, base);
  const job = {
    id: fixId, runId, instanceId: inst.id, page, fixer: 'external', status: 'applied', createdAt: run.createdAt,
    summary: reply.summary, accepted: inst.patches, rejected: [], changed: before !== after,
    diff: createTwoFilesPatch(`${page}.html (before)`, `${page}.html (after)`, before, after, '', '', { context: 2 }),
    note: 'Rebuilt after a server restart from the fixer reply and the saved patches.',
  };
  fs.writeFileSync(`data/fixes/${fixId}.json`, JSON.stringify(job, null, 2));
  console.log(fixId, runId, page, inst.patches.length, 'patches', job.diff.split('\n').length, 'diff lines');
}
