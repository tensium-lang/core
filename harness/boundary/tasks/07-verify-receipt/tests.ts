// This file is the secret answer key for one change request to the shop app: adding a way to check that a receipt's signature is real, without giving the signing key to the client.
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
  assert.equal(await c.quoteSummary(2, 1, 1), 'error: out of stock');
  assert.equal(await c.quoteSummary(1, 0, 1), 'error: quantity must be at least 1');
  assert.equal(await c.quoteSummary(9, 1, 1), 'error: no such product');
  assert.equal(await c.quoteSummary(1, 1, 9), 'error: no such customer');
  assert.equal(await c.receiptText(1, 2, 1), `Receipt for Ann Lee: 2 x Widget, total $20.00 [${ctx.signature('1:1:2000')}]`);
  assert.equal(await c.receiptText(3, 1, 3), `Receipt for Cy Young: 1 x Gizmo, total $5.00 [${ctx.signature('3:3:500')}]`);
  assert.equal(await c.receiptText(2, 1, 1), 'error: out of stock');
  const good = ctx.signature('1:1:2000');
  assert.equal(await c.receiptIsValid(1, 2, 1, good), true);
  assert.equal(await c.receiptIsValid(3, 1, 3, ctx.signature('3:3:500')), true);
  assert.equal(await c.receiptIsValid(1, 2, 1, '0000000000000000'), false);
  assert.equal(await c.receiptIsValid(1, 2, 1, ''), false);
  assert.equal(await c.receiptIsValid(1, 3, 1, good), false);
  assert.equal(await c.receiptIsValid(2, 1, 1, good), false);
  assert.equal(await c.receiptIsValid(1, 2, 9, good), false);
  // nothing that reveals or uses the signing key may be in the code shipped to the client
  for (const leak of [ctx.key, 'SIGNING_KEY', 'process.env', 'createHmac']) {
    assert.ok(!ctx.clientSource.includes(leak), `client code must not contain ${leak === ctx.key ? 'the signing key' : leak}`);
  }
};
