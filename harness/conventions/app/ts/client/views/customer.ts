// The customer screen: who the customer is, their payment terms, and a one-line summary of each
// of their invoices with what is still owed.

import type { Customer, Invoice, Totals } from '../../shared/types.ts';
import { formatCents, statusWord } from '../format.ts';
import { rpc } from '../rpc.ts';

export async function customerView(customerId: number): Promise<string> {
  const c = await rpc<Customer>('getCustomer', [customerId]);
  if (!c.ok) return 'error: ' + c.error;
  const invoices = await rpc<Invoice[]>('customerInvoices', [customerId]);
  if (!invoices.ok) return 'error: ' + invoices.error;
  const lines: string[] = [];
  lines.push(`${c.value.name} <${c.value.email}>`);
  lines.push(`Terms: net ${c.value.termsDays}`);
  lines.push(`Region: ${c.value.region}`);
  let owed = 0;
  for (const inv of invoices.value) {
    const t = await rpc<Totals>('invoiceTotals', [inv.id]);
    if (!t.ok) return 'error: ' + t.error;
    const balance = inv.status === 'sent' ? t.value.balanceCents : 0;
    owed += balance;
    lines.push(`  #${inv.id} ${inv.issuedOn} ${statusWord(inv.status)} total ${formatCents(t.value.totalCents)} balance ${formatCents(balance)}`);
  }
  lines.push(`Outstanding: ${formatCents(owed)}`);
  return lines.join('\n');
}

/** "Ann Lee <ann@example.com>" for a customer. */
export async function contactLine(customerId: number): Promise<string> {
  const c = await rpc<Customer>('getCustomer', [customerId]);
  if (!c.ok) return 'error: ' + c.error;
  return `${c.value.name} <${c.value.email}>`;
}
