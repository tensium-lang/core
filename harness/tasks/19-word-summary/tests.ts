// This file is the secret answer key for one task: finding the first word of a sentence and describing it, when there might be no words. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.equal(m.firstWord('  hello world'), 'hello');
  assert.equal(m.firstWord('one'), 'one');
  assert.equal(m.firstWord('a b c'), 'a');
  assert.equal(m.firstWord('   '), null);
  assert.equal(m.firstWord(''), null);
  assert.deepEqual(m.wordSummary('hello world'), { ok: true, value: 'HELLO:5' });
  assert.deepEqual(m.wordSummary('  hi'), { ok: true, value: 'HI:2' });
  assert.deepEqual(m.wordSummary('   '), { ok: false, error: 'no words' });
  assert.deepEqual(m.wordSummary(''), { ok: false, error: 'no words' });
};
