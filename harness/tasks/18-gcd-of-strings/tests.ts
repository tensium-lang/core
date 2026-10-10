// This file is the secret answer key for one task: finding the biggest number that divides two numbers written as text. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.gcdOfStrings('12', '18'), { ok: true, value: 6 });
  assert.deepEqual(m.gcdOfStrings('7', '13'), { ok: true, value: 1 });
  assert.deepEqual(m.gcdOfStrings('100', '10'), { ok: true, value: 10 });
  assert.deepEqual(m.gcdOfStrings('9', '9'), { ok: true, value: 9 });
  for (const [a, b] of [['0', '5'], ['5', '0'], ['-4', '6'], ['x', '6'], ['4', 'y']]) assert.equal(m.gcdOfStrings(a, b).ok, false, a + ',' + b);
};
