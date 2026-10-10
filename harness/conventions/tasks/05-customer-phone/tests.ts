// This file is the secret answer key for one change request to the invoicing app: showing the customer's phone number.
// It starts the real server, calls the client the way a screen would, and checks every line of
// text that comes back. The helper doing the task never gets to see it.

import assert from 'node:assert/strict';
import { Ctx, cases, runBaseline } from '../../baseline.tests.ts';

const PHONES: Record<string, string> = {
  'Ann Lee': '555-0101', 'Bo Chen': '(none)', 'Cy Young': '555-0103', 'Di Park': '(none)',
  'Ed Ruiz': '555-0105', 'Fay Wu': '(none)', 'Gus Hale': '555-0107', 'Ivy Noor': '(none)',
};

/** The screen as it was, with the phone line slipped in after the given line. */
function withPhone(expected: string, afterPrefix: string): string {
  const lines = expected.split('\n');
  const name = Object.keys(PHONES).find((n) => lines[0].includes(n));
  if (!name) return expected; // an error screen
  const at = lines.findIndex((l) => l.startsWith(afterPrefix));
  lines.splice(at + 1, 0, `Phone: ${PHONES[name]}`);
  return lines.join('\n');
}

export default async (c: any, ctx: Ctx) => {
  await runBaseline(c, ctx, ['invoiceView', 'customerView']);
  for (const [screen, call, expected] of cases) {
    if (screen === 'invoiceView') assert.equal(await call(c, ctx), withPhone(expected(ctx), 'Status:'));
    if (screen === 'customerView') assert.equal(await call(c, ctx), withPhone(expected(ctx), 'Terms:'));
  }
  assert.match(await c.invoiceView(2), /\nPhone: \(none\)\n/);
  assert.match(await c.customerView(7), /\nPhone: 555-0107\n/);
};
