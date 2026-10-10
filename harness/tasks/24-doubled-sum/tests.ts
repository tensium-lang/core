// This file is the secret answer key for one task: adding two numbers written as text and doubling the result. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.equal(m.doubledSum('1', '2'), 6);
  assert.equal(m.doubledSum('-1', '1'), 0);
  assert.equal(m.doubledSum('10', '-4'), 12);
  assert.equal(m.doubledSum('x', '2'), 0);
  assert.equal(m.doubledSum('3', 'y'), 0);
  assert.equal(m.doubledSum('', ''), 0);
};
