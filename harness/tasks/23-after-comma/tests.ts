// This file is the secret answer key for one task: getting the text after the first comma, or reporting there is none. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  assert.equal(m.afterComma('a,b,c'), 'b,c');
  assert.equal(m.afterComma('x,'), '');
  assert.equal(m.afterComma(',z'), 'z');
  assert.ok(m.afterComma('abc') === null, 'no comma should give back null');
  assert.ok(m.afterComma('') === null, 'empty string should give back null');
};
