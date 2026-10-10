// This file is the secret answer key for one task: dividing two numbers written as text and failing in two different ways. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.ratio('10', '4'), { ok: true, value: 2.5 });
  assert.deepEqual(m.ratio('-9', '3'), { ok: true, value: -3 });
  assert.deepEqual(m.ratio('x', '2'), { ok: false, error: 'bad input' });
  assert.deepEqual(m.ratio('2', 'y'), { ok: false, error: 'bad input' });
  assert.deepEqual(m.ratio('x', '0'), { ok: false, error: 'bad input' });
  assert.deepEqual(m.ratio('5', '0'), { ok: false, error: 'divide by zero' });
};
