// The invoice screen: asks the server for an invoice, its customer, its products and its totals,
// and lays them out as the lines of text a person sees.

import type { Customer, Invoice, Product, Receipt, Totals } from '../../shared/types.ts';
import { discountNote, formatCents, statusWord } from '../format.ts';
import { rpc } from '../rpc.ts';

export async function invoiceView(invoiceId: number): Promise<string> {
  const inv = await rpc<Invoice>('getInvoice', [invoiceId]);
  if (!inv.ok) return 'error: ' + inv.error;
  const cust = await rpc<Customer>('getCustomer', [inv.value.customerId]);
  if (!cust.ok) return 'error: ' + cust.error;
  const totals = await rpc<Totals>('invoiceTotals', [invoiceId]);
  if (!totals.ok) return 'error: ' + totals.error;
  const lines: string[] = [];
  lines.push(`Invoice #${inv.value.id} for ${cust.value.name}`);
  lines.push(`Status: ${statusWord(inv.value.status)}`);
  lines.push(`Issued: ${inv.value.issuedOn}`);
  for (const l of inv.value.lines) {
    const p = await rpc<Product>('getProduct', [l.productId]);
    const name = p.ok ? p.value.name : `product #${l.productId}`;
    lines.push(`  ${l.quantity} x ${name} @ ${formatCents(l.unitCents)} = ${formatCents(l.unitCents * l.quantity)}`);
  }
  const t = totals.value;
  lines.push(`Subtotal: ${formatCents(t.subtotalCents)}`);
  if (t.discountCents !== 0) lines.push(`Discount${discountNote(inv.value.discountPercent)}: -${formatCents(t.discountCents)}`);
  lines.push(`Tax: ${formatCents(t.taxCents)}`);
  lines.push(`Total: ${formatCents(t.totalCents)}`);
  if (t.paidCents !== 0) lines.push(`Paid: ${formatCents(t.paidCents)}`);
  if (t.creditCents !== 0) lines.push(`Credits: ${formatCents(t.creditCents)}`);
  lines.push(`Balance: ${formatCents(t.balanceCents)}`);
  if (inv.value.notes !== null) lines.push(`Notes: ${inv.value.notes}`);
  return lines.join('\n');
}

/** One line per product: "Widget - $12.50" with "(taxable)" when tax applies. */
export async function productLabel(productId: number): Promise<string> {
  const p = await rpc<Product>('getProduct', [productId]);
  if (!p.ok) return 'error: ' + p.error;
  return `${p.value.name} - ${formatCents(p.value.unitCents)}${p.value.taxable ? ' (taxable)' : ''}`;
}

/** The signed receipt for an invoice, as one line. */
export async function receiptLine(invoiceId: number): Promise<string> {
  const r = await rpc<Receipt>('signedReceipt', [invoiceId]);
  if (!r.ok) return 'error: ' + r.error;
  return `Receipt #${r.value.invoiceId}: total ${formatCents(r.value.totalCents)}, paid ${formatCents(r.value.paidCents)} [${r.value.signature}]`;
}

/** The reminder email the server would send, as text. */
export async function reminderPreview(invoiceId: number): Promise<string> {
  const r = await rpc<string>('reminderText', [invoiceId]);
  if (!r.ok) return 'error: ' + r.error;
  return r.value;
}
