// This file is the secret answer key for one change request to the invoicing app: recording a payment against an invoice.
// It starts the real server, calls the client the way a screen would, and checks every line of
// text that comes back. The helper doing the task never gets to see it.

import assert from 'node:assert/strict';
import { Ctx, runBaseline } from '../../baseline.tests.ts';

export default async (c: any, ctx: Ctx) => {
  await runBaseline(c, ctx);
  assert.equal(await c.paymentResult(1, 5950, 'card'), 'Payment of $59.50 recorded on #1; balance now $0.00');
  assert.equal(await c.paymentResult(12, 1000, 'cash'), 'Payment of $10.00 recorded on #12; balance now $210.00');
  assert.equal(await c.paymentResult(1, 6000, 'card'), 'error: payment exceeds balance');
  assert.equal(await c.paymentResult(1, 0, 'card'), 'error: payment must be more than zero');
  assert.equal(await c.paymentResult(1, -5, 'card'), 'error: payment must be more than zero');
  assert.equal(await c.paymentResult(5, 100, 'card'), 'error: invoice is void');
  assert.equal(await c.paymentResult(4, 100, 'card'), 'error: invoice has not been sent');
  assert.equal(await c.paymentResult(3, 100, 'card'), 'error: invoice is already paid');
  assert.equal(await c.paymentResult(99, 1, 'card'), 'error: no such invoice');
  const r = await ctx.rpc('recordPayment', [1, 5950, 'card']);
  assert.equal(r.ok, true, 'recordPayment must answer with a Result');
  assert.deepEqual(r.value, { invoiceId: 1, amountCents: 5950, balanceAfterCents: 0 });
  assert.deepEqual(await ctx.rpc('recordPayment', [1, 6000, 'card']), { ok: false, error: 'payment exceeds balance' });
  assert.deepEqual(await ctx.rpc('recordPayment', [5, 100, 'card']), { ok: false, error: 'invoice is void' });
};
