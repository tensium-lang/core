// This file is the secret answer key for one task: picking the first text that is not empty, if there is one. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.equal(m.firstNonEmpty('x', 'y', 'z'), 'x');
  assert.equal(m.firstNonEmpty('', 'y', 'z'), 'y');
  assert.equal(m.firstNonEmpty('', '', 'z'), 'z');
  assert.ok(m.firstNonEmpty('', '', '') === null, 'all empty should give back null');
};
