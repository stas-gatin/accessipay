// Findings are checked against the record of the run, without AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyFinding, kindsOf } from '../server/verify.mjs';

const run = {
  persona: 'screenreader',
  events: [
    { type: 'observe', step: 3, text: 'Page as an accessibility tree:\n- banner:\n  - link "Cart"\n  - link:\n    - img\n  - checkbox\n- main:\n  - button "Add to cart"\n  - button "Add to cart"\n  - button "Add to cart"\nKeyboard focus: link "Cart"' },
    { type: 'act', step: 3, result: 'Pressed Enter on the focused element.' },
    { type: 'observe', step: 4, text: '- main:\n  - heading "Cart"\n  - button "Tooltip"\nKeyboard focus: ' },
    { type: 'end', text: '- checkbox "Email me with news and offers" [checked]' },
  ],
};

test('confirms what the record shows', () => {
  assert.equal(verifyFinding(run, { step: 3, problem: 'Header links have no accessible name.' }).status, 'confirmed');
  assert.equal(verifyFinding(run, { step: 3, problem: 'Every Add to cart button has the same name.', element: { role: 'button', name: 'Add to cart' } }).status, 'confirmed');
  assert.equal(verifyFinding(run, { step: 4, problem: 'After the cart opened, focus was lost (nothing focused).' }).status, 'confirmed');
  assert.equal(verifyFinding(run, { step: 4, problem: 'Email me with news and offers is pre-checked.' }).status, 'confirmed');
});

test('does not confirm a claim the record contradicts, and leaves the rest to a person', () => {
  // The record names the button "Tooltip": it has a name, a vague one, not none.
  assert.equal(verifyFinding(run, { step: 4, problem: 'The tooltip button has no name at all.' }).status, 'not-confirmed');
  assert.equal(verifyFinding(run, { step: 4, problem: 'Colours are hard to tell apart.' }).status, 'manual');
  assert.deepEqual(kindsOf({ problem: 'Unnamed icon buttons, and focus was lost after closing the cart.' }), ['unnamed', 'focus']);
});
