// The heart of the invoicing server: looking up invoices, working out what they add up to
// (subtotal, discount, tax, payments, credits and the balance still owed), when they are due,
// and the one place where an invoice is allowed to move from one status to the next.

import type { Cents, Invoice, InvoiceId, Status, Totals, Result } from '../shared/types.ts';
import { TODAY } from './clock.ts';
import { CREDIT_NOTES, PAYMENTS, findCustomer, findInvoice, findProduct } from './data.ts';
import { addDays, daysBetween, isAfter } from './lib/dates.ts';
import { percentOf, sumCents } from './lib/money.ts';
import { err, ok } from './lib/result.ts';

/** Sales tax, in basis points: 8 %. Charged on taxable products only. */
export const TAX_BASIS_POINTS = 800;

export function getInvoice(id: InvoiceId): Result<Invoice, string> {
  const inv = findInvoice(id);
  if (inv === null) return err('no such invoice');
  return ok(inv);
}

export function subtotalOf(inv: Invoice): Cents {
  return sumCents(inv.lines.map((l) => l.unitCents * l.quantity));
}

/** The part of the subtotal that tax applies to: lines whose product is taxable. */
export function taxableSubtotalOf(inv: Invoice): Cents {
  let total = 0;
  for (const l of inv.lines) {
    const p = findProduct(l.productId);
    if (p !== null && p.taxable) total += l.unitCents * l.quantity;
  }
  return total;
}

export function paidOn(id: InvoiceId): Cents {
  return sumCents(PAYMENTS.filter((p) => p.invoiceId === id).map((p) => p.amountCents));
}

export function creditedOn(id: InvoiceId): Cents {
  return sumCents(CREDIT_NOTES.filter((c) => c.invoiceId === id).map((c) => c.amountCents));
}

export function totalsOf(inv: Invoice): Totals {
  const subtotalCents = subtotalOf(inv);
  const discountCents = percentOf(subtotalCents, inv.discountPercent * 100);
  const taxCents = percentOf(taxableSubtotalOf(inv), TAX_BASIS_POINTS);
  const totalCents = subtotalCents - discountCents + taxCents;
  const paidCents = paidOn(inv.id);
  const creditCents = creditedOn(inv.id);
  return { subtotalCents, discountCents, taxCents, totalCents, paidCents, creditCents, balanceCents: totalCents - paidCents - creditCents };
}

export function invoiceTotals(id: InvoiceId): Result<Totals, string> {
  const inv = findInvoice(id);
  if (inv === null) return err('no such invoice');
  return ok(totalsOf(inv));
}

/** The day payment is due: the customer's terms counted from the day the invoice was issued. */
export function dueOn(inv: Invoice): Result<string, string> {
  const c = findCustomer(inv.customerId);
  if (c === null) return err('no such customer');
  return ok(addDays(inv.issuedOn, c.termsDays));
}

/** Days past due as of today, or 0 if not overdue (only sent invoices can be overdue). */
export function daysOverdue(inv: Invoice): Result<number, string> {
  if (inv.status !== 'sent') return ok(0);
  const due = dueOn(inv);
  if (!due.ok) return due;
  if (!isAfter(TODAY, due.value)) return ok(0);
  return ok(daysBetween(due.value, TODAY));
}

/**
 * Moves an invoice to its next status and stamps the date. This is the only place a status may
 * change: it refuses moves the business does not allow (paying a void invoice, sending a paid one, ...).
 */
export function transition(inv: Invoice, next: Status): Result<Invoice, string> {
  if (inv.status === 'paid') return err('invoice is already paid');
  if (inv.status === 'void') return err('invoice is void');
  if (next === 'draft') return err('an invoice cannot go back to draft');
  if (next === 'sent') {
    if (inv.status === 'sent') return err('invoice is already sent');
    return ok({ ...inv, status: 'sent', sentOn: TODAY });
  }
  if (next === 'paid') {
    if (inv.status === 'draft') return err('a draft invoice cannot be paid');
    return ok({ ...inv, status: 'paid', paidOn: TODAY });
  }
  return ok({ ...inv, status: 'void' });
}

/** Checks that a draft invoice is complete enough to be sent to the customer. */
export function readyToSend(inv: Invoice): Result<void, string> {
  if (inv.lines.length === 0) return err('invoice has no lines');
  for (const l of inv.lines) {
    if (l.quantity < 1) return err('line quantity must be at least 1');
    if (findProduct(l.productId) === null) return err('line refers to an unknown product');
  }
  const c = findCustomer(inv.customerId);
  if (c === null) return err('no such customer');
  if (c.email === '') return err('customer has no email address');
  return ok(undefined);
}
