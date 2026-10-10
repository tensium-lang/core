// This file is the secret answer key for one task: answering yes or no: is this text a whole number?. It runs the helper's finished
// program with a few inputs and checks the answers. The helper never gets to see it.

import assert from 'node:assert/strict';
export default (m: any) => {
  for (const ok of ['12', '-3', '0', '007']) assert.equal(m.isWholeNumber(ok), true, ok);
  for (const bad of ['x', '', '1.5', ' 4', '--2']) assert.equal(m.isWholeNumber(bad), false, JSON.stringify(bad));
};
