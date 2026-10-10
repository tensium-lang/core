// This file is the secret answer key for one task: turning text into a number and keeping it between a low and a high limit. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.parseClamped('5', 0, 10), { ok: true, value: 5 });
  assert.deepEqual(m.parseClamped('-5', 0, 10), { ok: true, value: 0 });
  assert.deepEqual(m.parseClamped('50', 0, 10), { ok: true, value: 10 });
  assert.deepEqual(m.parseClamped('10', 0, 10), { ok: true, value: 10 });
  assert.equal(m.parseClamped('x', 0, 10).ok, false);
};
