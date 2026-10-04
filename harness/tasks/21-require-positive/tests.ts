// This file is the secret answer key for one task: a function that must refuse a number that is not positive. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.requirePositive(5), { ok: true, value: 5 });
  assert.deepEqual(m.requirePositive(0.5), { ok: true, value: 0.5 });
  assert.deepEqual(m.requirePositive(0), { ok: false, error: 'not positive' });
  assert.deepEqual(m.requirePositive(-3), { ok: false, error: 'not positive' });
};
