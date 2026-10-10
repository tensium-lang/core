// This file is the secret answer key for one change request to the invoicing app: a summary of a customer's credit notes.
// It starts the real server, calls the client the way a screen would, and checks every line of
// text that comes back. The helper doing the task never gets to see it.

import assert from 'node:assert/strict';
import { Ctx, runBaseline } from '../../baseline.tests.ts';

export default async (c: any, ctx: Ctx) => {
  await runBaseline(c, ctx);
  assert.equal(await c.creditSummary(6), 'Credits for Fay Wu: #7 $4.29');
  assert.equal(await c.creditSummary(7), 'Credits for Gus Hale: #8 $50.00');
  assert.equal(await c.creditSummary(1), 'Credits for Ann Lee: none');
  assert.equal(await c.creditSummary(8), 'Credits for Ivy Noor: none');
  assert.equal(await c.creditSummary(99), 'error: no such customer');
  const r = await ctx.rpc('customerCredits', [6]);
  assert.equal(r.ok, true, 'customerCredits must answer with a Result');
  assert.deepEqual(r.value, [{ invoiceId: 7, creditCents: 429 }]);
  assert.deepEqual((await ctx.rpc('customerCredits', [7])).value, [{ invoiceId: 8, creditCents: 5000 }]);
  assert.deepEqual((await ctx.rpc('customerCredits', [1])).value, []);
  assert.deepEqual(await ctx.rpc('customerCredits', [99]), { ok: false, error: 'no such customer' });
};
