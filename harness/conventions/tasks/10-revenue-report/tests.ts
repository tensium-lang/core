// This file is the secret answer key for one change request to the invoicing app: a revenue report by month.
// It starts the real server, calls the client the way a screen would, and checks every line of
// text that comes back. The helper doing the task never gets to see it.

import assert from 'node:assert/strict';
import { Ctx, runBaseline } from '../../baseline.tests.ts';

export default async (c: any, ctx: Ctx) => {
  await runBaseline(c, ctx);
  assert.equal(await c.revenueView(), '2026-04: $600.00\n2026-08: $71.26');
  const r = await ctx.rpc('revenueByMonth', []);
  assert.equal(r.ok, true, 'revenueByMonth must answer with a Result');
  assert.deepEqual(r.value, [{ month: '2026-04', paidCents: 60000 }, { month: '2026-08', paidCents: 7126 }]);
};
