// This file is the secret answer key for one task: working out a percentage from two numbers written as text. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.percent('1', '4'), { ok: true, value: 25 });
  assert.deepEqual(m.percent('1', '3'), { ok: true, value: 33 });
  assert.deepEqual(m.percent('0', '7'), { ok: true, value: 0 });
  assert.equal(m.percent('1', '0').ok, false);
  assert.equal(m.percent('x', '4').ok, false);
  assert.equal(m.percent('1', 'y').ok, false);
};
