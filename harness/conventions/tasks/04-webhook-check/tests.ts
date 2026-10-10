// This file is the secret answer key for one change request to the invoicing app: letting the client check whether a webhook payload is genuine.
// It starts the real server, calls the client the way a screen would, and checks every line of
// text that comes back. The helper doing the task never gets to see it.

import assert from 'node:assert/strict';
import { Ctx, runBaseline } from '../../baseline.tests.ts';

export default async (c: any, ctx: Ctx) => {
  await runBaseline(c, ctx);
  assert.equal(await c.webhookStatus(1, 10000, ctx.signature('1:15950:10000')), 'genuine');
  assert.equal(await c.webhookStatus(3, 7126, ctx.signature('3:7126:7126')), 'genuine');
  assert.equal(await c.webhookStatus(1, 10000, 'deadbeefdeadbeef'), 'forged');
  assert.equal(await c.webhookStatus(1, 9999, ctx.signature('1:15950:10000')), 'forged');
  assert.equal(await c.webhookStatus(1, 9999, ctx.signature('1:15950:9999')), 'forged');
  assert.equal(await c.webhookStatus(2, 0, ctx.signature('2:10799:0')), 'genuine');
  assert.equal(await c.webhookStatus(4, 0, ctx.signature('4:4900:0')), 'error: invoice has not been sent');
  assert.equal(await c.webhookStatus(5, 0, 'x'), 'error: invoice is void');
  assert.equal(await c.webhookStatus(99, 0, 'x'), 'error: no such invoice');
  for (const word of ['WEBHOOK_SECRET', ctx.key, 'createHmac', 'hmac', 'Hmac', 'sha2', 'sha256']) {
    assert.ok(!ctx.clientSource.includes(word), `client code must not contain ${word}: the secret and the signing stay on the server`);
  }
};
