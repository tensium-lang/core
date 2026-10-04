// This file is the secret answer key for one task: turning text into a whole number that is zero or bigger. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.parseNonNegative('42'), { ok: true, value: 42 });
  assert.deepEqual(m.parseNonNegative('0'), { ok: true, value: 0 });
  assert.equal(m.parseNonNegative('-1').ok, false);
  assert.equal(m.parseNonNegative('abc').ok, false);
  assert.equal(m.parseNonNegative('').ok, false);
  assert.equal(m.parseNonNegative('1.5').ok, false);
};
