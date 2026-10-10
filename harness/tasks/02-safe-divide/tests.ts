// This file is the secret answer key for one task: dividing two numbers without crashing when the bottom number is zero. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.safeDivide(10, 4), { ok: true, value: 2.5 });
  assert.deepEqual(m.safeDivide(-9, 3), { ok: true, value: -3 });
  assert.equal(m.safeDivide(1, 0).ok, false);
  assert.equal(m.safeDivide(0, 0).ok, false);
  assert.deepEqual(m.safeDivide(0, 5), { ok: true, value: 0 });
};
