// This file is the secret answer key for one change request to the shop app: none at all; this one checks the app as it is before any change.
// It starts the real server, calls the client the way a screen would, and checks every line of
// text that comes back. The helper doing the task never gets to see it.

import assert from 'node:assert/strict';

/** What the test rig hands to each answer key. */
export interface Ctx {
  /** Calls a server function directly over HTTP and returns the raw JSON reply. */
  rpc: (name: string, args: unknown[]) => Promise<any>;
  /** The correct signature for a message, made with the real signing key. */
  signature: (message: string) => string;
  /** The signing key itself, and all the code that would be shipped to the client. */
  key: string;
  clientSource: string;
}

export default async (c: any, ctx: Ctx) => {
  assert.equal(await c.productLabel(1), 'Widget - $12.50');
  assert.equal(await c.productLabel(2), 'Gadget - $99.99 (sold out)');
  assert.equal(await c.productLabel(3), 'Gizmo - $5.00');
  assert.equal(await c.productLabel(9), 'error: no such product');
  assert.equal(await c.canBuy(1), true);
  assert.equal(await c.canBuy(2), false);
  assert.equal(await c.canBuy(9), false);
  assert.equal(await c.greeting(1), 'Hello, Ann Lee (gold)');
  assert.equal(await c.greeting(2), 'Hello, Bo Chen (silver)');
  assert.equal(await c.greeting(9), 'error: no such customer');
  assert.equal(await c.contactLine(2), 'Bo Chen <bo@example.com>');
  assert.equal(await c.contactLine(3), 'Cy Young <cy@example.com>');
  assert.equal(await c.contactLine(9), 'error: no such customer');
  assert.equal(await c.quoteSummary(1, 2, 1), '2 x Widget = $20.00 (20% off)');
  assert.equal(await c.quoteSummary(3, 3, 3), '3 x Gizmo = $15.00');
  assert.equal(await c.quoteSummary(1, 1, 2), '1 x Widget = $11.25 (10% off)');
  assert.equal(await c.quoteSummary(1, 20, 1), '20 x Widget = $200.00 (20% off)');
  assert.equal(await c.quoteSummary(2, 1, 1), 'error: out of stock');
  assert.equal(await c.quoteSummary(1, 0, 1), 'error: quantity must be at least 1');
  assert.equal(await c.quoteSummary(9, 1, 1), 'error: no such product');
  assert.equal(await c.quoteSummary(1, 1, 9), 'error: no such customer');
  assert.equal(await c.quoteSummary(1, 6, 3), 'error: over the limit');
  assert.equal(await c.quoteSummary(1, 11, 2), 'error: over the limit');
  assert.equal(await c.quoteSummary(1, 21, 1), 'error: over the limit');
  assert.equal(await c.receiptText(1, 2, 1), `Receipt for Ann Lee: 2 x Widget, total $20.00 [${ctx.signature('1:1:2000')}]`);
  assert.equal(await c.receiptText(3, 1, 3), `Receipt for Cy Young: 1 x Gizmo, total $5.00 [${ctx.signature('3:3:500')}]`);
  assert.equal(await c.receiptText(2, 1, 1), 'error: out of stock');
  assert.equal(await c.availabilityText(1, 2, 1), 'available');
  assert.equal(await c.availabilityText(2, 1, 1), 'sold out');
  assert.equal(await c.availabilityText(1, 6, 3), 'over the limit');
  assert.equal(await c.availabilityText(1, 5, 3), 'available');
  assert.equal(await c.availabilityText(9, 1, 1), 'error: no such product');
  assert.equal(await c.availabilityText(1, 1, 9), 'error: no such customer');
};
