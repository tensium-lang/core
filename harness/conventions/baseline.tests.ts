// This file is the secret answer key for the invoicing app as it is before any change request.
// It starts the real server, calls every screen the way a person would, and checks every line of
// text that comes back against values worked out by hand. The helper doing a task never sees it.

import assert from 'node:assert/strict';

/** What the test rig hands to each answer key. */
export interface Ctx {
  /** Calls a server function directly over HTTP and returns the raw JSON reply. */
  rpc: (name: string, args: unknown[]) => Promise<any>;
  /** The correct signature for a message, made with the real webhook secret. */
  signature: (message: string) => string;
  /** The secret itself, and all the code that would be shipped to the client. */
  key: string;
  clientSource: string;
}

/** Everything the app did before the change request must still hold. */
export async function baseline(c: any, ctx: Ctx): Promise<void> {
  assert.equal(await c.invoiceView(1), `Invoice #1 for Ann Lee
Status: sent
Issued: 2026-08-01
  2 x Widget @ $12.50 = $25.00
  1 x Consulting hour @ $150.00 = $150.00
Subtotal: $175.00
Discount (10% off): -$17.50
Tax: $2.00
Total: $159.50
Paid: $100.00
Balance: $59.50
Notes: Thanks for the referral`);
  assert.equal(await c.invoiceView(2), `Invoice #2 for Bo Chen
Status: sent
Issued: 2026-09-20
  1 x Gadget @ $99.99 = $99.99
Subtotal: $99.99
Tax: $8.00
Total: $107.99
Balance: $107.99`);
  assert.equal(await c.invoiceView(3), `Invoice #3 for Cy Young
Status: paid
Issued: 2026-07-15
  10 x Gizmo @ $5.00 = $50.00
  2 x Cable @ $7.99 = $15.98
Subtotal: $65.98
Tax: $5.28
Total: $71.26
Paid: $71.26
Balance: $0.00`);
  assert.equal(await c.invoiceView(4), `Invoice #4 for Ann Lee
Status: draft
Issued: 2026-09-28
  1 x Support plan @ $49.00 = $49.00
Subtotal: $49.00
Tax: $0.00
Total: $49.00
Balance: $49.00
Notes: Renewal`);
  assert.equal(await c.invoiceView(5), `Invoice #5 for Di Park
Status: void
Issued: 2026-06-01
  1 x Installation @ $220.00 = $220.00
Subtotal: $220.00
Tax: $0.00
Total: $220.00
Balance: $220.00
Notes: Cancelled by customer`);
  assert.equal(await c.invoiceView(6), `Invoice #6 for Ed Ruiz
Status: sent
Issued: 2026-07-20
  3 x Manual @ $25.00 = $75.00
Subtotal: $75.00
Tax: $0.00
Total: $75.00
Paid: $72.00
Balance: $3.00`);
  assert.equal(await c.invoiceView(7), `Invoice #7 for Fay Wu
Status: sent
Issued: 2026-09-01
  20 x Sticker pack @ $1.50 = $30.00
  4 x Bracket @ $3.25 = $13.00
Subtotal: $43.00
Discount (5% off): -$2.15
Tax: $3.44
Total: $44.29
Credits: $4.29
Balance: $40.00`);
  assert.equal(await c.invoiceView(8), `Invoice #8 for Gus Hale
Status: sent
Issued: 2026-05-01
  1 x Training day @ $800.00 = $800.00
Subtotal: $800.00
Tax: $0.00
Total: $800.00
Paid: $500.00
Credits: $50.00
Balance: $250.00
Notes: On-site`);
  assert.equal(await c.invoiceView(12), `Invoice #12 for Di Park
Status: sent
Issued: 2026-08-20
  2 x Gadget @ $99.99 = $199.98
  1 x Cable @ $7.99 = $7.99
Subtotal: $207.97
Tax: $16.64
Total: $224.61
Paid: $4.61
Balance: $220.00`);
  assert.equal(await c.invoiceView(14), `Invoice #14 for Ann Lee
Status: sent
Issued: 2026-09-01
  4 x Gizmo @ $5.00 = $20.00
  2 x Sticker pack @ $1.50 = $3.00
Subtotal: $23.00
Tax: $1.84
Total: $24.84
Balance: $24.84`);
  assert.equal(await c.invoiceView(15), `Invoice #15 for Gus Hale
Status: sent
Issued: 2026-02-01
  10 x Bracket @ $3.25 = $32.50
Subtotal: $32.50
Tax: $2.60
Total: $35.10
Balance: $35.10`);
  assert.equal(await c.invoiceView(17), `Invoice #17 for Fay Wu
Status: sent
Issued: 2026-08-01
  1 x Cable @ $7.99 = $7.99
Subtotal: $7.99
Tax: $0.64
Total: $8.63
Paid: $1.63
Balance: $7.00`);
  assert.equal(await c.invoiceView(99), 'error: no such invoice');
  assert.equal(await c.customerView(1), `Ann Lee <ann@example.com>
Terms: net 30
Region: east
  #1 2026-08-01 sent total $159.50 balance $59.50
  #4 2026-09-28 draft total $49.00 balance $0.00
  #14 2026-09-01 sent total $24.84 balance $24.84
Outstanding: $84.34`);
  assert.equal(await c.customerView(2), `Bo Chen <bo@example.com>
Terms: net 15
Region: west
  #2 2026-09-20 sent total $107.99 balance $107.99
  #11 2026-04-01 paid total $600.00 balance $0.00
Outstanding: $107.99`);
  assert.equal(await c.customerView(6), `Fay Wu <fay@example.com>
Terms: net 15
Region: south
  #7 2026-09-01 sent total $44.29 balance $40.00
  #17 2026-08-01 sent total $8.63 balance $7.00
Outstanding: $47.00`);
  assert.equal(await c.customerView(7), `Gus Hale <gus@example.com>
Terms: net 60
Region: east
  #8 2026-05-01 sent total $800.00 balance $250.00
  #15 2026-02-01 sent total $35.10 balance $35.10
Outstanding: $285.10`);
  assert.equal(await c.customerView(9), 'error: no such customer');
  assert.equal(await c.dashboardView(), `Draft: 2
Sent: 11
Paid: 2
Void: 2
Outstanding: $858.93`);
  assert.equal(await c.overdueView(), `#15 Gus Hale: $35.10 due 2026-04-02, 182 days overdue
#8 Gus Hale: $250.00 due 2026-06-30, 93 days overdue
#17 Fay Wu: $7.00 due 2026-08-16, 46 days overdue
#6 Ed Ruiz: $3.00 due 2026-08-19, 43 days overdue
#1 Ann Lee: $59.50 due 2026-08-31, 31 days overdue
#7 Fay Wu: $40.00 due 2026-09-16, 15 days overdue`);
  assert.equal(await c.agingView(), `Current: $464.33
1-30 days: $40.00
31-60 days: $69.50
61-90 days: $0.00
Over 90 days: $285.10`);
  assert.equal(await c.catalogView(), `Widget - $12.50 (taxable)
Gadget - $99.99 (taxable)
Gizmo - $5.00 (taxable)
Consulting hour - $150.00
Support plan - $49.00
Cable - $7.99 (taxable)
Manual - $25.00
Bracket - $3.25 (taxable)
Installation - $220.00
Sticker pack - $1.50 (taxable)
Training day - $800.00
Spare part - $17.99 (taxable)`);
  assert.equal(await c.searchView('a'), `Gadget - $99.99
Support plan - $49.00
Cable - $7.99
Manual - $25.00
Bracket - $3.25
Installation - $220.00
Sticker pack - $1.50
Training day - $800.00
Spare part - $17.99`);
  assert.equal(await c.searchView('zzz'), 'No products match');
  assert.equal(await c.searchView(' '), 'error: search text is empty');
  assert.equal(await c.regionView('east'), `Ann Lee (net 30)
Cy Young (net 30)
Gus Hale (net 60)`);
  assert.equal(await c.regionView('mars'), 'error: no customers in region mars');
  assert.equal(await c.receiptLine(1), `Receipt #1: total $159.50, paid $100.00 [${ctx.signature('1:15950:10000')}]`);
  assert.equal(await c.receiptLine(3), `Receipt #3: total $71.26, paid $71.26 [${ctx.signature('3:7126:7126')}]`);
  assert.equal(await c.receiptLine(4), 'error: invoice has not been sent');
  assert.equal(await c.receiptLine(5), 'error: invoice is void');
  assert.equal(await c.receiptLine(99), 'error: no such invoice');
  assert.equal(await c.reminderPreview(1), `To: ann@example.com
Hello Ann Lee, invoice #1 for $59.50 was due on 2026-08-31 and is 31 days overdue.`);
  assert.equal(await c.reminderPreview(2), `To: bo@example.com
Hello Bo Chen, invoice #2 for $107.99 is due on 2026-10-05.`);
  assert.equal(await c.reminderPreview(3), 'error: only a sent invoice can be reminded');
  assert.equal(await c.reminderPreview(6), `To: ed@example.com
Hello Ed Ruiz, invoice #6 for $3.00 was due on 2026-08-19 and is 43 days overdue.`);
  assert.equal(await c.reminderPreview(14), `To: ann@example.com
Hello Ann Lee, invoice #14 for $24.84 is due on 2026-10-01.`);
  assert.equal(await c.reminderPreview(99), 'error: no such invoice');
  assert.equal(await c.productLabel(1), 'Widget - $12.50 (taxable)');
  assert.equal(await c.productLabel(4), 'Consulting hour - $150.00');
  assert.equal(await c.productLabel(99), 'error: no such product');
  assert.equal(await c.contactLine(2), 'Bo Chen <bo@example.com>');
  assert.equal(await c.contactLine(99), 'error: no such customer');
  const t6 = await ctx.rpc('invoiceTotals', [6]);
  assert.deepEqual(t6, { ok: true, value: { subtotalCents: 7500, discountCents: 0, taxCents: 0, totalCents: 7500, paidCents: 7200, creditCents: 0, balanceCents: 300 } });
  const t17 = await ctx.rpc('invoiceTotals', [17]);
  assert.equal(t17.value.balanceCents, 700);
  assert.equal((await ctx.rpc('getInvoice', [99])).ok, false);
  assert.ok(!ctx.clientSource.includes('WEBHOOK_SECRET'), 'client code must not mention the webhook secret');
  assert.ok(!ctx.clientSource.includes(ctx.key), 'client code must not contain the webhook secret');
}

export default baseline;
