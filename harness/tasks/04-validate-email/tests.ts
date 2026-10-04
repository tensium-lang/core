// This file is the secret answer key for one task: checking that something looks like an email address. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.deepEqual(m.validateEmail('a@b.co'), { ok: true, value: 'a@b.co' });
  assert.deepEqual(m.validateEmail('  Alice@Example.COM '), { ok: true, value: 'alice@example.com' });
  for (const bad of ['ab.co', '@b.co', 'a@bco', 'a@.co', 'a@b.', '', '   ']) {
    assert.equal(m.validateEmail(bad).ok, false, `should reject ${JSON.stringify(bad)}`);
  }
};
