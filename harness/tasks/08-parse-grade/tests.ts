// This file is the secret answer key for one task: turning a test score typed as text into a letter grade. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  const g = (s: string) => m.parseGrade(s);
  assert.deepEqual(g('100'), { ok: true, value: 'A' });
  assert.deepEqual(g('90'), { ok: true, value: 'A' });
  assert.deepEqual(g('89'), { ok: true, value: 'B' });
  assert.deepEqual(g('80'), { ok: true, value: 'B' });
  assert.deepEqual(g('79'), { ok: true, value: 'C' });
  assert.deepEqual(g('70'), { ok: true, value: 'C' });
  assert.deepEqual(g('69'), { ok: true, value: 'F' });
  assert.deepEqual(g('0'), { ok: true, value: 'F' });
  for (const bad of ['101', '-1', 'abc', '']) assert.equal(g(bad).ok, false, bad);
};
