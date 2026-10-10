// The dashboard screen: how many invoices are in each status, the total still owed, and the
// list of overdue invoices.

import type { OverdueEntry, Stats } from '../../shared/types.ts';
import { formatCents } from '../format.ts';
import { rpc } from '../rpc.ts';

export async function dashboardView(): Promise<string> {
  const s = await rpc<Stats>('dashboardStats', []);
  if (!s.ok) return 'error: ' + s.error;
  const v = s.value;
  return [
    `Draft: ${v.draft}`,
    `Sent: ${v.sent}`,
    `Paid: ${v.paid}`,
    `Void: ${v.void}`,
    `Outstanding: ${formatCents(v.outstandingCents)}`,
  ].join('\n');
}

export async function overdueView(): Promise<string> {
  const r = await rpc<OverdueEntry[]>('overdueInvoices', []);
  if (!r.ok) return 'error: ' + r.error;
  if (r.value.length === 0) return 'Nothing overdue';
  const lines: string[] = [];
  for (const e of r.value) {
    lines.push(`#${e.invoiceId} ${e.customerName}: ${formatCents(e.balanceCents)} due ${e.dueOn}, ${e.daysOverdue} days overdue`);
  }
  return lines.join('\n');
}
