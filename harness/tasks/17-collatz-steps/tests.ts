// This file is the secret answer key for one task: counting the steps of the Collatz game, using a function that calls itself. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.collatzSteps(1), { ok: true, value: 0 });
  assert.deepEqual(m.collatzSteps(2), { ok: true, value: 1 });
  assert.deepEqual(m.collatzSteps(6), { ok: true, value: 8 });
  assert.deepEqual(m.collatzSteps(7), { ok: true, value: 16 });
  assert.deepEqual(m.collatzSteps(27), { ok: true, value: 111 });
  assert.equal(m.collatzSteps(0).ok, false);
  assert.equal(m.collatzSteps(-5).ok, false);
};
