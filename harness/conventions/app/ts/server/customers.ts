// Customer lookups for the server: one customer by id, a product by id, and the invoices that
// belong to a customer.

import type { Customer, CustomerId, Invoice, InvoiceId, Product, ProductId, Result } from '../shared/types.ts';
import { INVOICES, findCustomer, findInvoice, findProduct } from './data.ts';
import { err, ok } from './lib/result.ts';

export function getCustomer(id: CustomerId): Result<Customer, string> {
  const c = findCustomer(id);
  if (c === null) return err('no such customer');
  return ok(c);
}

export function getProduct(id: ProductId): Result<Product, string> {
  const p = findProduct(id);
  if (p === null) return err('no such product');
  return ok(p);
}

export function customerInvoices(customerId: CustomerId): Result<Invoice[], string> {
  const c = findCustomer(customerId);
  if (c === null) return err('no such customer');
  return ok(INVOICES.filter((i) => i.customerId === customerId));
}

/** True when the invoice exists and belongs to the customer. */
export function invoiceBelongsTo(invoiceId: InvoiceId, customerId: CustomerId): boolean {
  const inv = findInvoice(invoiceId);
  return inv !== null && inv.customerId === customerId;
}
