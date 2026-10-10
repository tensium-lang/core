// This file is the secret answer key for one task: two small functions where the helper has to decide the types itself. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.equal(m.halve(9), 4.5);
  assert.equal(m.halve(-4), -2);
  assert.equal(m.lastChar('abc'), 'c');
  assert.equal(m.lastChar('x'), 'x');
  assert.ok(m.lastChar('') === null, 'empty string should give back null');
};
