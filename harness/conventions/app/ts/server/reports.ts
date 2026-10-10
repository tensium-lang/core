// Reports for the dashboard: how many invoices are in each status, how much is still owed in
// total, and the list of overdue invoices with how late each one is.

import type { OverdueEntry, Stats, Result } from '../shared/types.ts';
import { INVOICES, findCustomer } from './data.ts';
import { daysOverdue, dueOn, totalsOf } from './invoices.ts';
import { err, ok } from './lib/result.ts';

export function dashboardStats(): Result<Stats, string> {
  const s: Stats = { draft: 0, sent: 0, paid: 0, void: 0, outstandingCents: 0 };
  for (const inv of INVOICES) {
    s[inv.status] += 1;
    if (inv.status === 'sent') s.outstandingCents += totalsOf(inv).balanceCents;
  }
  return ok(s);
}

/** Sent invoices past their due date, oldest due date first. */
export function overdueInvoices(): Result<OverdueEntry[], string> {
  const out: OverdueEntry[] = [];
  for (const inv of INVOICES) {
    const late = daysOverdue(inv);
    if (!late.ok) return late;
    if (late.value === 0) continue;
    const due = dueOn(inv);
    if (!due.ok) return due;
    const c = findCustomer(inv.customerId);
    if (c === null) return err('no such customer');
    out.push({ invoiceId: inv.id, customerName: c.name, dueOn: due.value, daysOverdue: late.value, balanceCents: totalsOf(inv).balanceCents });
  }
  out.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
  return ok(out);
}
