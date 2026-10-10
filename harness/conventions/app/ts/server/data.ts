// The server's data: the customers, products, invoices, payments and credit notes it knows about.
// This is a fixed set that stands in for a database, so the app behaves the same every time.

import type { CreditNote, Customer, Invoice, Payment, Product } from '../shared/types.ts';

export const CUSTOMERS: Customer[] = [
  { id: 1, name: 'Ann Lee', email: 'ann@example.com', phone: '555-0101', termsDays: 30, region: 'east' },
  { id: 2, name: 'Bo Chen', email: 'bo@example.com', phone: null, termsDays: 15, region: 'west' },
  { id: 3, name: 'Cy Young', email: 'cy@example.com', phone: '555-0103', termsDays: 30, region: 'east' },
  { id: 4, name: 'Di Park', email: 'di@example.com', phone: null, termsDays: 45, region: 'north' },
  { id: 5, name: 'Ed Ruiz', email: 'ed@example.com', phone: '555-0105', termsDays: 30, region: 'west' },
  { id: 6, name: 'Fay Wu', email: 'fay@example.com', phone: null, termsDays: 15, region: 'south' },
  { id: 7, name: 'Gus Hale', email: 'gus@example.com', phone: '555-0107', termsDays: 60, region: 'east' },
  { id: 8, name: 'Ivy Noor', email: 'ivy@example.com', phone: null, termsDays: 30, region: 'north' },
];

export const PRODUCTS: Product[] = [
  { id: 1, name: 'Widget', unitCents: 1250, taxable: true },
  { id: 2, name: 'Gadget', unitCents: 9999, taxable: true },
  { id: 3, name: 'Gizmo', unitCents: 500, taxable: true },
  { id: 4, name: 'Consulting hour', unitCents: 15000, taxable: false },
  { id: 5, name: 'Support plan', unitCents: 4900, taxable: false },
  { id: 6, name: 'Cable', unitCents: 799, taxable: true },
  { id: 7, name: 'Manual', unitCents: 2500, taxable: false },
  { id: 8, name: 'Bracket', unitCents: 325, taxable: true },
  { id: 9, name: 'Installation', unitCents: 22000, taxable: false },
  { id: 10, name: 'Sticker pack', unitCents: 150, taxable: true },
  { id: 11, name: 'Training day', unitCents: 80000, taxable: false },
  { id: 12, name: 'Spare part', unitCents: 1799, taxable: true },
];

export const INVOICES: Invoice[] = [
  { id: 1, customerId: 1, issuedOn: '2026-08-01', status: 'sent', lines: [{ productId: 1, quantity: 2, unitCents: 1250 }, { productId: 4, quantity: 1, unitCents: 15000 }], discountPercent: 10, notes: 'Thanks for the referral', sentOn: '2026-08-01', paidOn: null },
  { id: 2, customerId: 2, issuedOn: '2026-09-20', status: 'sent', lines: [{ productId: 2, quantity: 1, unitCents: 9999 }], discountPercent: 0, notes: null, sentOn: '2026-09-20', paidOn: null },
  { id: 3, customerId: 3, issuedOn: '2026-07-15', status: 'paid', lines: [{ productId: 3, quantity: 10, unitCents: 500 }, { productId: 6, quantity: 2, unitCents: 799 }], discountPercent: 0, notes: null, sentOn: '2026-07-15', paidOn: '2026-08-10' },
  { id: 4, customerId: 1, issuedOn: '2026-09-28', status: 'draft', lines: [{ productId: 5, quantity: 1, unitCents: 4900 }], discountPercent: 0, notes: 'Renewal', sentOn: null, paidOn: null },
  { id: 5, customerId: 4, issuedOn: '2026-06-01', status: 'void', lines: [{ productId: 9, quantity: 1, unitCents: 22000 }], discountPercent: 0, notes: 'Cancelled by customer', sentOn: '2026-06-01', paidOn: null },
  { id: 6, customerId: 5, issuedOn: '2026-07-20', status: 'sent', lines: [{ productId: 7, quantity: 3, unitCents: 2500 }], discountPercent: 0, notes: null, sentOn: '2026-07-20', paidOn: null },
  { id: 7, customerId: 6, issuedOn: '2026-09-01', status: 'sent', lines: [{ productId: 10, quantity: 20, unitCents: 150 }, { productId: 8, quantity: 4, unitCents: 325 }], discountPercent: 5, notes: null, sentOn: '2026-09-01', paidOn: null },
  { id: 8, customerId: 7, issuedOn: '2026-05-01', status: 'sent', lines: [{ productId: 11, quantity: 1, unitCents: 80000 }], discountPercent: 0, notes: 'On-site', sentOn: '2026-05-01', paidOn: null },
  { id: 9, customerId: 8, issuedOn: '2026-09-10', status: 'draft', lines: [{ productId: 12, quantity: 2, unitCents: 1799 }], discountPercent: 0, notes: null, sentOn: null, paidOn: null },
  { id: 10, customerId: 3, issuedOn: '2026-09-25', status: 'sent', lines: [{ productId: 1, quantity: 1, unitCents: 1250 }], discountPercent: 0, notes: null, sentOn: '2026-09-25', paidOn: null },
  { id: 11, customerId: 2, issuedOn: '2026-04-01', status: 'paid', lines: [{ productId: 4, quantity: 4, unitCents: 15000 }], discountPercent: 0, notes: null, sentOn: '2026-04-01', paidOn: '2026-04-10' },
  { id: 12, customerId: 4, issuedOn: '2026-08-20', status: 'sent', lines: [{ productId: 2, quantity: 2, unitCents: 9999 }, { productId: 6, quantity: 1, unitCents: 799 }], discountPercent: 0, notes: null, sentOn: '2026-08-20', paidOn: null },
  { id: 13, customerId: 5, issuedOn: '2026-03-01', status: 'void', lines: [{ productId: 1, quantity: 5, unitCents: 1250 }], discountPercent: 0, notes: 'Duplicate', sentOn: '2026-03-01', paidOn: null },
  { id: 14, customerId: 1, issuedOn: '2026-09-01', status: 'sent', lines: [{ productId: 3, quantity: 4, unitCents: 500 }, { productId: 10, quantity: 2, unitCents: 150 }], discountPercent: 0, notes: null, sentOn: '2026-09-01', paidOn: null },
  { id: 15, customerId: 7, issuedOn: '2026-02-01', status: 'sent', lines: [{ productId: 8, quantity: 10, unitCents: 325 }], discountPercent: 0, notes: null, sentOn: '2026-02-01', paidOn: null },
  { id: 16, customerId: 8, issuedOn: '2026-09-15', status: 'sent', lines: [{ productId: 5, quantity: 2, unitCents: 4900 }], discountPercent: 0, notes: null, sentOn: '2026-09-15', paidOn: null },
  { id: 17, customerId: 6, issuedOn: '2026-08-01', status: 'sent', lines: [{ productId: 6, quantity: 1, unitCents: 799 }], discountPercent: 0, notes: null, sentOn: '2026-08-01', paidOn: null },
  { id: 18, customerId: 8, issuedOn: '2026-09-30', status: 'draft', lines: [{ productId: 12, quantity: 0, unitCents: 1799 }], discountPercent: 0, notes: 'Quantity to be confirmed', sentOn: null, paidOn: null },
];

export const PAYMENTS: Payment[] = [
  { invoiceId: 1, amountCents: 10000, receivedOn: '2026-08-20', method: 'card' },
  { invoiceId: 3, amountCents: 7126, receivedOn: '2026-08-10', method: 'transfer' },
  { invoiceId: 6, amountCents: 7200, receivedOn: '2026-08-30', method: 'card' },
  { invoiceId: 8, amountCents: 50000, receivedOn: '2026-06-15', method: 'transfer' },
  { invoiceId: 11, amountCents: 60000, receivedOn: '2026-04-10', method: 'card' },
  { invoiceId: 12, amountCents: 461, receivedOn: '2026-09-01', method: 'cash' },
  { invoiceId: 17, amountCents: 163, receivedOn: '2026-08-10', method: 'cash' },
];

export const CREDIT_NOTES: CreditNote[] = [
  { id: 1, invoiceId: 7, amountCents: 429, reason: 'damaged stickers' },
  { id: 2, invoiceId: 8, amountCents: 5000, reason: 'late delivery' },
];

export function findCustomer(id: number): Customer | null {
  for (const c of CUSTOMERS) if (c.id === id) return c;
  return null;
}

export function findProduct(id: number): Product | null {
  for (const p of PRODUCTS) if (p.id === id) return p;
  return null;
}

export function findInvoice(id: number): Invoice | null {
  for (const i of INVOICES) if (i.id === id) return i;
  return null;
}
