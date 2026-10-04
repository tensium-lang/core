// This file is the secret answer key for one task: counting how many of three texts are whole numbers. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.equal(m.countValid('1', '2', '3'), 3);
  assert.equal(m.countValid('x', '2', 'y'), 1);
  assert.equal(m.countValid('', '', ''), 0);
  assert.equal(m.countValid('-4', '4.5', '7'), 2);
  assert.equal(m.countValid('a', 'b', '0'), 1);
};
