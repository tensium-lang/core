// Credit notes on the server: money the business has agreed to take off an invoice (for damaged
// goods, late delivery and so on), and the total credited on an invoice.

import type { Cents, CreditNote, CustomerId, InvoiceId, Result } from '../shared/types.ts';
import { invoiceBelongsTo } from './customers.ts';
import { CREDIT_NOTES, findInvoice } from './data.ts';
import { sumCents } from './lib/money.ts';
import { err, ok } from './lib/result.ts';

export function creditsFor(id: InvoiceId): Result<CreditNote[], string> {
  const inv = findInvoice(id);
  if (inv === null) return err('no such invoice');
  return ok(CREDIT_NOTES.filter((c) => c.invoiceId === id));
}

/**
 * The total credited on one of a customer's invoices. The customer id is checked first so a
 * customer can only ever see credits on their own invoices.
 */
export function creditTotal(customerId: CustomerId, invoiceId: InvoiceId): Result<Cents, string> {
  if (!invoiceBelongsTo(invoiceId, customerId)) return err('invoice does not belong to customer');
  return ok(sumCents(CREDIT_NOTES.filter((c) => c.invoiceId === invoiceId).map((c) => c.amountCents)));
}
