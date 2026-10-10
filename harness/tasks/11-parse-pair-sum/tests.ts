// This file is the secret answer key for one task: reading two numbers written as "3,4" and adding them. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.parsePairSum('3,4'), { ok: true, value: 7 });
  assert.deepEqual(m.parsePairSum('10,-2'), { ok: true, value: 8 });
  assert.deepEqual(m.parsePairSum('-1,-1'), { ok: true, value: -2 });
  for (const bad of ['34', 'a,4', '3,b', '3,4,5', ',4', '4,', '', ',']) assert.equal(m.parsePairSum(bad).ok, false, bad);
};
