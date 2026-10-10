// This file is the secret answer key for one change request to the invoicing app: a one-line summary of an invoice.
// It starts the real server, calls the client the way a screen would, and checks every line of
// text that comes back. The helper doing the task never gets to see it.

import assert from 'node:assert/strict';
import { Ctx, runBaseline } from '../../baseline.tests.ts';

export default async (c: any, ctx: Ctx) => {
  await runBaseline(c, ctx);
  assert.equal(await c.summaryLine(1), '#1 Ann Lee sent total $159.50 balance $59.50');
  assert.equal(await c.summaryLine(3), '#3 Cy Young paid total $71.26 balance $0.00');
  assert.equal(await c.summaryLine(5), '#5 Di Park void total $220.00 balance $220.00');
  assert.equal(await c.summaryLine(7), '#7 Fay Wu sent total $44.29 balance $40.00');
  assert.equal(await c.summaryLine(18), '#18 Ivy Noor draft total $0.00 balance $0.00');
  assert.equal(await c.summaryLine(99), 'error: no such invoice');
  const r = await ctx.rpc('invoiceSummary', [1]);
  assert.equal(r.ok, true, 'invoiceSummary must answer with a Result');
  assert.equal(r.value, '#1 Ann Lee sent total $159.50 balance $59.50');
  const bad = await ctx.rpc('invoiceSummary', [99]);
  assert.deepEqual(bad, { ok: false, error: 'no such invoice' });
};
