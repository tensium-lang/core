// This file is the secret answer key for one change request to the invoicing app: a late fee on overdue invoices.
// It starts the real server, calls the client the way a screen would, and checks every line of
// text that comes back. The helper doing the task never gets to see it.

import assert from 'node:assert/strict';
import { Ctx, runBaseline } from '../../baseline.tests.ts';

export default async (c: any, ctx: Ctx) => {
  await runBaseline(c, ctx);
  // 1.5 % of $3.00 for one period is 4.5 cents: half to even gives 4, not 5
  assert.equal(await c.lateFeeLine(6), 'Late fee for #6: $0.04 (1 period)');
  // 1.5 % of $7.00 is 10.5 cents: half to even gives 10, not 11
  assert.equal(await c.lateFeeLine(17), 'Late fee for #17: $0.10 (1 period)');
  assert.equal(await c.lateFeeLine(8), 'Late fee for #8: $11.25 (3 periods)');
  assert.equal(await c.lateFeeLine(15), 'Late fee for #15: $3.16 (6 periods)');
  assert.equal(await c.lateFeeLine(1), 'Late fee for #1: $0.89 (1 period)');
  assert.equal(await c.lateFeeLine(7), 'No late fee for #7');
  assert.equal(await c.lateFeeLine(2), 'No late fee for #2');
  assert.equal(await c.lateFeeLine(3), 'No late fee for #3');
  assert.equal(await c.lateFeeLine(5), 'No late fee for #5');
  assert.equal(await c.lateFeeLine(99), 'error: no such invoice');
  const r = await ctx.rpc('lateFee', [6]);
  assert.equal(r.ok, true, 'lateFee must answer with a Result');
  assert.deepEqual(r.value, { invoiceId: 6, periods: 1, feeCents: 4 });
  assert.deepEqual((await ctx.rpc('lateFee', [17])).value, { invoiceId: 17, periods: 1, feeCents: 10 });
  assert.deepEqual((await ctx.rpc('lateFee', [8])).value, { invoiceId: 8, periods: 3, feeCents: 1125 });
  assert.deepEqual((await ctx.rpc('lateFee', [7])).value, { invoiceId: 7, periods: 0, feeCents: 0 });
};
