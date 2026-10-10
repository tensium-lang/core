// Reminder messages: the text of the email the business sends when an invoice is overdue,
// written on the server so the wording and the amounts come from one place.

import type { InvoiceId, Result } from '../shared/types.ts';
import { findCustomer, findInvoice } from './data.ts';
import { daysOverdue, dueOn, totalsOf } from './invoices.ts';
import { formatCents } from './lib/money.ts';
import { err, ok } from './lib/result.ts';

export function reminderText(id: InvoiceId): Result<string, string> {
  const inv = findInvoice(id);
  if (inv === null) return err('no such invoice');
  if (inv.status !== 'sent') return err('only a sent invoice can be reminded');
  const c = findCustomer(inv.customerId);
  if (c === null) return err('no such customer');
  const due = dueOn(inv);
  if (!due.ok) return due;
  const late = daysOverdue(inv);
  if (!late.ok) return late;
  const balance = formatCents(totalsOf(inv).balanceCents);
  if (late.value === 0) {
    return ok(`To: ${c.email}\nHello ${c.name}, invoice #${inv.id} for ${balance} is due on ${due.value}.`);
  }
  return ok(`To: ${c.email}\nHello ${c.name}, invoice #${inv.id} for ${balance} was due on ${due.value} and is ${late.value} days overdue.`);
}
