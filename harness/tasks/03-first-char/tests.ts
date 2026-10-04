// This file is the secret answer key for one task: grabbing the first letter of a word, even when the word is empty. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.equal(m.firstChar('hello'), 'h');
  assert.equal(m.firstChar(''), null);
  assert.equal(m.firstCharUpper('hello'), 'H');
  assert.equal(m.firstCharUpper(''), '');
  assert.equal(m.firstCharUpper('Zed'), 'Z');
};
