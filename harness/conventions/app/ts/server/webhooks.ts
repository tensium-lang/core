// Signed receipts and webhook signatures. The server holds the secret and uses it to sign a short
// message about an invoice, so anyone who gets the receipt later can check it was not made up.
// The secret itself is read here and nowhere else.

import { createHmac } from 'node:crypto';
import type { InvoiceId, Receipt, Result } from '../shared/types.ts';
import { findInvoice } from './data.ts';
import { totalsOf } from './invoices.ts';
import { err, ok } from './lib/result.ts';

function secret(): string {
  return process.env.WEBHOOK_SECRET ?? '';
}

/** The first 16 hex characters of an HMAC-SHA256 of the message. */
export function signature(message: string): string {
  return createHmac('sha256', secret()).update(message).digest('hex').slice(0, 16);
}

/** A receipt for a sent or paid invoice, signed as "<invoice id>:<total>:<paid>". */
export function signedReceipt(id: InvoiceId): Result<Receipt, string> {
  const inv = findInvoice(id);
  if (inv === null) return err('no such invoice');
  if (inv.status === 'draft') return err('invoice has not been sent');
  if (inv.status === 'void') return err('invoice is void');
  const t = totalsOf(inv);
  return ok({ invoiceId: inv.id, totalCents: t.totalCents, paidCents: t.paidCents, signature: signature(`${inv.id}:${t.totalCents}:${t.paidCents}`) });
}
