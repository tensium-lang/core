// The aging report: how much of the money still owed is 1-30 days overdue, 31-60, 61-90 and
// more than 90 days, so the business can see which debts are getting old.

import type { Cents, Result } from '../shared/types.ts';
import { INVOICES } from './data.ts';
import { daysOverdue, totalsOf } from './invoices.ts';
import { ok } from './lib/result.ts';

export type AgingBuckets = { current: Cents; days1to30: Cents; days31to60: Cents; days61to90: Cents; over90: Cents };

export function agingReport(): Result<AgingBuckets, string> {
  const b: AgingBuckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0 };
  for (const inv of INVOICES) {
    if (inv.status !== 'sent') continue;
    const late = daysOverdue(inv);
    if (!late.ok) return late;
    const balance = totalsOf(inv).balanceCents;
    if (late.value === 0) b.current += balance;
    else if (late.value <= 30) b.days1to30 += balance;
    else if (late.value <= 60) b.days31to60 += balance;
    else if (late.value <= 90) b.days61to90 += balance;
    else b.over90 += balance;
  }
  return ok(b);
}
