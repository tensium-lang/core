// This file is the secret answer key for one change request to the invoicing app: settling an invoice with a payment.
// It starts the real server, calls the client the way a screen would, and checks every line of
// text that comes back. The helper doing the task never gets to see it.

import assert from 'node:assert/strict';
import { Ctx, runBaseline } from '../../baseline.tests.ts';

export default async (c: any, ctx: Ctx) => {
  await runBaseline(c, ctx);
  assert.equal(await c.settleResult(1, 5950), 'Invoice #1 paid in full on 2026-10-01');
  assert.equal(await c.settleResult(6, 300), 'Invoice #6 paid in full on 2026-10-01');
  assert.equal(await c.settleResult(12, 1000), 'Invoice #12 now has a balance of $210.00');
  assert.equal(await c.settleResult(8, 20000), 'Invoice #8 now has a balance of $50.00');
  assert.equal(await c.settleResult(1, 6000), 'error: payment exceeds balance');
  assert.equal(await c.settleResult(1, 0), 'error: payment must be more than zero');
  assert.equal(await c.settleResult(5, 1), 'error: invoice is void');
  assert.equal(await c.settleResult(3, 1), 'error: invoice is already paid');
  assert.equal(await c.settleResult(4, 1), 'error: invoice has not been sent');
  assert.equal(await c.settleResult(99, 1), 'error: no such invoice');
  const r = await ctx.rpc('settle', [1, 5950]);
  assert.equal(r.ok, true, 'settle must answer with a Result');
  assert.equal(r.value.id, 1);
  assert.equal(r.value.paidOn, '2026-10-01');
  const partial = await ctx.rpc('settle', [12, 1000]);
  assert.equal(partial.ok, true);
  assert.equal(partial.value.paidOn, null);
  assert.deepEqual(await ctx.rpc('settle', [5, 1]), { ok: false, error: 'invoice is void' });
};
