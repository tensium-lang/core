// This file is the secret answer key for one task: turning text like "101" (binary) into a number, using a function that calls itself. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.parseBinary('101'), { ok: true, value: 5 });
  assert.deepEqual(m.parseBinary('0'), { ok: true, value: 0 });
  assert.deepEqual(m.parseBinary('1111'), { ok: true, value: 15 });
  assert.deepEqual(m.parseBinary('0010'), { ok: true, value: 2 });
  for (const bad of ['', '102', 'abc', '1 0', '-1']) assert.equal(m.parseBinary(bad).ok, false, JSON.stringify(bad));
};
