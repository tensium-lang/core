// This file is the secret answer key for one task: building a greeting when the first or last name might be missing. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.equal(m.greeting('Ann', 'Lee'), 'Hello, Ann Lee');
  assert.equal(m.greeting('Ann', null), 'Hello, Ann');
  assert.equal(m.greeting(null, 'Lee'), 'Hello, Lee');
  assert.equal(m.greeting(null, null), 'Hello, stranger');
};
