// This file is the secret answer key for one change request to the invoicing app: confirming a customer statement.
// It starts the real server, calls the client the way a screen would, and checks every line of
// text that comes back. The helper doing the task never gets to see it.

import assert from 'node:assert/strict';
import { Ctx, runBaseline } from '../../baseline.tests.ts';

export default async (c: any, ctx: Ctx) => {
  await runBaseline(c, ctx);
  assert.equal(await c.confirmStatementResult(1, 8434), 'Statement for Ann Lee confirmed at $84.34');
  assert.equal(await c.confirmStatementResult(6, 4700), 'Statement for Fay Wu confirmed at $47.00');
  assert.equal(await c.confirmStatementResult(3, 1350), 'Statement for Cy Young confirmed at $13.50');
  assert.equal(await c.confirmStatementResult(1, 8000), 'error: outstanding has changed: expected $84.34');
  assert.equal(await c.confirmStatementResult(2, 0), 'error: outstanding has changed: expected $107.99');
  assert.equal(await c.confirmStatementResult(99, 0), 'error: no such customer');
  const r = await ctx.rpc('confirmStatement', [1, 8434]);
  assert.equal(r.ok, true, 'confirmStatement must answer with a Result');
  assert.deepEqual(r.value, { customerId: 1, outstandingCents: 8434 });
  assert.deepEqual(await ctx.rpc('confirmStatement', [1, 1]), { ok: false, error: 'outstanding has changed: expected $84.34' });
};
