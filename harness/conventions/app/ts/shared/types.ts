// The record types that the invoicing server and client both use, kept in one place so the two
// halves can never disagree about what an invoice, a customer or a payment looks like.

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/** Whole cents. See CONTRIBUTING.md: money is never a float. */
export type Cents = number;

export type CustomerId = number;
export type ProductId = number;
export type InvoiceId = number;

/** The life of an invoice: draft -> sent -> paid, or draft/sent -> void. */
export type Status = 'draft' | 'sent' | 'paid' | 'void';

export type Customer = {
  id: CustomerId;
  name: string;
  email: string;
  phone: string | null;
  /** Payment terms: the invoice is due this many days after it is issued. */
  termsDays: number;
  region: string;
};

export type Product = { id: ProductId; name: string; unitCents: Cents; taxable: boolean };

export type LineItem = { productId: ProductId; quantity: number; unitCents: Cents };

export type Invoice = {
  id: InvoiceId;
  customerId: CustomerId;
  issuedOn: string;
  status: Status;
  lines: LineItem[];
  discountPercent: number;
  notes: string | null;
  sentOn: string | null;
  paidOn: string | null;
};

export type Payment = { invoiceId: InvoiceId; amountCents: Cents; receivedOn: string; method: string };

export type CreditNote = { id: number; invoiceId: InvoiceId; amountCents: Cents; reason: string };

export type Totals = {
  subtotalCents: Cents;
  discountCents: Cents;
  taxCents: Cents;
  totalCents: Cents;
  paidCents: Cents;
  creditCents: Cents;
  balanceCents: Cents;
};

export type OverdueEntry = { invoiceId: InvoiceId; customerName: string; dueOn: string; daysOverdue: number; balanceCents: Cents };

export type Stats = { draft: number; sent: number; paid: number; void: number; outstandingCents: Cents };

export type Receipt = { invoiceId: InvoiceId; totalCents: Cents; paidCents: Cents; signature: string };
