// This file is the secret answer key for one task: adding up the digits in a piece of text, using a function that calls itself. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.sumDigits('123'), { ok: true, value: 6 });
  assert.deepEqual(m.sumDigits(''), { ok: true, value: 0 });
  assert.deepEqual(m.sumDigits('9'), { ok: true, value: 9 });
  assert.deepEqual(m.sumDigits('007'), { ok: true, value: 7 });
  assert.deepEqual(m.sumDigits('99999'), { ok: true, value: 45 });
  for (const bad of ['1a2', '-1', '1 2', 'x']) assert.equal(m.sumDigits(bad).ok, false, bad);
};
