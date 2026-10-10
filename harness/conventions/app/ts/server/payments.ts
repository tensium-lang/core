// Payments on the server: the payments already received for an invoice, and the rules for whether
// a new payment of a given size would be accepted.

import type { Cents, InvoiceId, Payment, Result } from '../shared/types.ts';
import { PAYMENTS, findInvoice } from './data.ts';
import { totalsOf } from './invoices.ts';
import { err, ok } from './lib/result.ts';

export function paymentsFor(id: InvoiceId): Result<Payment[], string> {
  const inv = findInvoice(id);
  if (inv === null) return err('no such invoice');
  return ok(PAYMENTS.filter((p) => p.invoiceId === id));
}

/** Whether a payment of this size could be taken on the invoice as it stands. */
export function paymentAllowed(id: InvoiceId, amountCents: Cents): Result<Cents, string> {
  const inv = findInvoice(id);
  if (inv === null) return err('no such invoice');
  if (inv.status === 'draft') return err('invoice has not been sent');
  if (inv.status === 'void') return err('invoice is void');
  if (inv.status === 'paid') return err('invoice is already paid');
  if (amountCents <= 0) return err('payment must be more than zero');
  const balance = totalsOf(inv).balanceCents;
  if (amountCents > balance) return err('payment exceeds balance');
  return ok(balance - amountCents);
}
