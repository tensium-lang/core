// This file is the secret answer key for one task: picking the best name to show when some names may be missing. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  const r = m.resolveName;
  assert.equal(r('Bo', 'Ann', 'Lee'), 'Bo');
  assert.equal(r('', 'Ann', 'Lee'), 'Ann Lee');
  assert.equal(r(null, 'Ann', 'Lee'), 'Ann Lee');
  assert.equal(r(null, 'Ann', null), 'Ann');
  assert.equal(r(null, null, 'Lee'), 'Lee');
  assert.equal(r('', 'Ann', null), 'Ann');
  assert.equal(r('', null, null), 'unknown');
  assert.equal(r(null, null, null), 'unknown');
};
