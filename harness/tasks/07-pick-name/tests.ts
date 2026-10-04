// This file is the secret answer key for one task: choosing between two names that might be missing. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.equal(m.pickName(true, 'Ann', 'Bob'), 'Ann');
  assert.equal(m.pickName(false, 'Ann', 'Bob'), 'Bob');
  assert.equal(m.pickName(true, null, 'Bob'), 'anonymous');
  assert.equal(m.pickName(false, 'Ann', null), 'anonymous');
  assert.equal(m.pickName(false, null, null), 'anonymous');
};
