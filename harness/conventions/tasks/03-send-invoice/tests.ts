// This file is the secret answer key for one change request to the invoicing app: sending a draft invoice to the customer.
// It starts the real server, calls the client the way a screen would, and checks every line of
// text that comes back. The helper doing the task never gets to see it.

import assert from 'node:assert/strict';
import { Ctx, runBaseline } from '../../baseline.tests.ts';

export default async (c: any, ctx: Ctx) => {
  await runBaseline(c, ctx);
  assert.equal(await c.sendResult(4), 'Invoice #4 sent on 2026-10-01');
  assert.equal(await c.sendResult(9), 'Invoice #9 sent on 2026-10-01');
  assert.equal(await c.sendResult(18), 'error: line quantity must be at least 1');
  assert.equal(await c.sendResult(1), 'error: invoice is already sent');
  assert.equal(await c.sendResult(3), 'error: invoice is already paid');
  assert.equal(await c.sendResult(5), 'error: invoice is void');
  assert.equal(await c.sendResult(99), 'error: no such invoice');
  const r = await ctx.rpc('sendInvoice', [4]);
  assert.equal(r.ok, true, 'sendInvoice must answer with a Result');
  assert.equal(r.value.id, 4);
  assert.equal(r.value.sentOn, '2026-10-01');
  assert.deepEqual(await ctx.rpc('sendInvoice', [18]), { ok: false, error: 'line quantity must be at least 1' });
  assert.deepEqual(await ctx.rpc('sendInvoice', [1]), { ok: false, error: 'invoice is already sent' });
};
