// This file is the secret answer key for one task: turning text into a number, or using a backup number when that fails. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.equal(m.parseOr('12', 0), 12);
  assert.equal(m.parseOr('-3', 7), -3);
  assert.equal(m.parseOr('nope', 7), 7);
  assert.equal(m.parseOr('', -1), -1);
};
