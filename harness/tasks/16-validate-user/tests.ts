// This file is the secret answer key for one task: checking a name and an age together, using a helper function that can fail. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.validateUser('  Ann ', '30'), { ok: true, value: 'Ann:30' });
  assert.deepEqual(m.validateUser('', '30'), { ok: false, error: 'empty name' });
  assert.deepEqual(m.validateUser('   ', 'x'), { ok: false, error: 'empty name' });
  assert.deepEqual(m.validateUser('Ann', 'x'), { ok: false, error: 'bad age' });
  assert.deepEqual(m.validateUser('Ann', '200'), { ok: false, error: 'bad age' });
  assert.deepEqual(m.parseAge('150'), { ok: true, value: 150 });
  assert.deepEqual(m.parseAge('0'), { ok: true, value: 0 });
  assert.deepEqual(m.parseAge('-1'), { ok: false, error: 'bad age' });
  assert.deepEqual(m.parseAge('q'), { ok: false, error: 'bad age' });
};
