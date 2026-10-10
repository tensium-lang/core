// This file is the secret answer key for one task: turning text into an age and giving clear error messages. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.parseBoundedAge('42'), { ok: true, value: 42 });
  assert.deepEqual(m.parseBoundedAge('0'), { ok: true, value: 0 });
  assert.deepEqual(m.parseBoundedAge('150'), { ok: true, value: 150 });
  assert.deepEqual(m.parseBoundedAge('151'), { ok: false, error: 'out of range' });
  assert.deepEqual(m.parseBoundedAge('-1'), { ok: false, error: 'out of range' });
  const bad = m.parseBoundedAge('abc');
  assert.equal(bad.ok, false);
  assert.ok(String(bad.error).startsWith('invalid age: '), String(bad.error));
  assert.ok(String(bad.error).length > 'invalid age: '.length, 'must include the parse error message');
};
