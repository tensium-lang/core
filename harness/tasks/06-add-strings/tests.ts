// This file is the secret answer key for one task: adding two numbers that were written as text. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.addStrings('2', '3'), { ok: true, value: 5 });
  assert.deepEqual(m.addStrings('-2', '2'), { ok: true, value: 0 });
  assert.equal(m.addStrings('x', '3').ok, false);
  assert.equal(m.addStrings('2', 'y').ok, false);
  assert.equal(m.addStrings('x', 'y').ok, false);
};
