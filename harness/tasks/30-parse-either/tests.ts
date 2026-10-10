// This file is the secret answer key for one task: trying one text as a number, and falling back to another. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.parseEither('4', '9'), { ok: true, value: 4 });
  assert.deepEqual(m.parseEither('x', '9'), { ok: true, value: 9 });
  assert.deepEqual(m.parseEither('x', 'y'), { ok: false, error: 'neither' });
  assert.deepEqual(m.parseEither('-2', 'y'), { ok: true, value: -2 });
};
