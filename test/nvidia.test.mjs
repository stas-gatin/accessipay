// The Nemotron brain: one chat completion per step, thinking stripped, the JSON decision parsed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nvidiaBrain, nvidiaFixer, stripThinking } from '../server/engine/brains/nvidia.mjs';

test('thinking is removed before the decision is read', () => {
  assert.equal(stripThinking('<think>maybe {"action":"read"}</think>\n{"action":"next","args":{}}'), '{"action":"next","args":{}}');
});

test('a step sends the persona prompt and returns the parsed decision', async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    sent = { url, body: JSON.parse(init.body), auth: init.headers.authorization };
    return new Response(JSON.stringify({ choices: [{ message: { content: '<think>the button is there</think>{"thought":"add it","action":"click","args":{"role":"button","name":"Add Trail Backpack to cart"}}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
  };
  const brain = nvidiaBrain({ model: 'nvidia/test-model', apiKey: 'k', fetchImpl });
  const d = await brain.decide({ persona: 'agent', goal: 'Buy one Trail Backpack.', observation: 'button "Add Trail Backpack to cart"', lastResult: '', step: 1, maxSteps: 40 });
  assert.match(sent.url, /\/chat\/completions$/);
  assert.equal(sent.auth, 'Bearer k');
  assert.equal(sent.body.model, 'nvidia/test-model');
  assert.equal(sent.body.messages[0].role, 'system');
  assert.deepEqual([d.action, d.args.name], ['click', 'Add Trail Backpack to cart']);
  assert.deepEqual([brain.usage.requests, brain.usage.input, brain.usage.output], [1, 10, 5]);
});

test('without a key the brain says so instead of calling the API', async () => {
  const brain = nvidiaBrain({ apiKey: '', fetchImpl: async () => { throw new Error('should not be called'); } });
  await assert.rejects(brain.decide({ persona: 'agent', goal: 'x', observation: 'y', step: 1, maxSteps: 2 }), /NVIDIA_API_KEY/);
});

test('the fixer asks for room to reason and answer, and reads a reply that repeats its JSON', async () => {
  let sent;
  const fix = '{"summary":"Use a button.","patches":[{"find":"<div id=\\"pay\\">Pay</div>","replace":"<button id=\\"pay\\">Pay</button>"}]}';
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: `${fix}\n${fix}` } }], usage: {} }), { status: 200 });
  };
  const r = await nvidiaFixer({ apiKey: 'k', fetchImpl, reasoningBudget: 1234 }).propose('fix it');
  assert.equal(sent.max_tokens, 32768);
  assert.equal(sent.chat_template_kwargs.reasoning_budget, 1234);
  assert.equal(r.error, undefined);
  assert.equal(r.patches[0].replace, '<button id="pay">Pay</button>');
});

test('a fix cut off by the token limit says so', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '' } }] }), { status: 200 });
  const r = await nvidiaFixer({ apiKey: 'k', fetchImpl }).propose('fix it');
  assert.match(r.error, /cut off/);
});

test('a dropped connection is retried', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"read","args":{}}' } }], usage: {} }), { status: 200 });
  };
  const d = await nvidiaBrain({ apiKey: 'k', fetchImpl }).decide({ persona: 'agent', goal: 'x', observation: 'y', step: 1, maxSteps: 2 });
  assert.equal(calls, 2);
  assert.equal(d.action, 'read');
});
