// This file is the secret answer key for one task: averaging three numbers typed as text and saying which one was bad. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.averageOfThree('3', '4', '5'), { ok: true, value: 4 });
  assert.deepEqual(m.averageOfThree('1', '2', '2'), { ok: true, value: 1 });
  assert.deepEqual(m.averageOfThree('-3', '-3', '-4'), { ok: true, value: -4 });
  assert.deepEqual(m.averageOfThree('x', '2', '3'), { ok: false, error: 'bad a' });
  assert.deepEqual(m.averageOfThree('1', 'y', 'z'), { ok: false, error: 'bad b' });
  assert.deepEqual(m.averageOfThree('1', '2', 'z'), { ok: false, error: 'bad c' });
  assert.deepEqual(m.averageOfThree('x', 'y', 'z'), { ok: false, error: 'bad a' });
};
