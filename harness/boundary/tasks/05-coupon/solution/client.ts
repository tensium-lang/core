// The client half of a small shop app. It asks the server for products, customers, quotes and
// receipts over HTTP and turns the answers into the lines of text a shopper sees.

import type { Customer, Product, Quote, Receipt, Result } from './types.ts';

let endpoint = 'http://127.0.0.1:8787';

/** Tells the client where the server is. */
export function connect(url: string): void {
  endpoint = url.replace(/\/$/, '');
}

async function rpc<T>(name: string, args: unknown[]): Promise<Result<T, string>> {
  try {
    const res = await fetch(`${endpoint}/rpc/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) return { ok: false, error: `network: HTTP ${res.status}` };
    return (await res.json()) as Result<T, string>;
  } catch (e) {
    return { ok: false, error: 'network: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

function formatCents(cents: number): string {
  const rest = cents % 100;
  return `$${Math.floor(cents / 100)}.${rest < 10 ? '0' : ''}${rest}`;
}

function discountNote(percent: number): string {
  return percent === 0 ? '' : ` (${percent}% off)`;
}

export async function productLabel(id: number): Promise<string> {
  const r = await rpc<Product>('getProduct', [id]);
  if (!r.ok) return 'error: ' + r.error;
  const p = r.value;
  const label = `${p.name} - ${formatCents(p.priceCents)}`;
  return p.inStock ? label : label + ' (sold out)';
}

export async function canBuy(productId: number): Promise<boolean> {
  const r = await rpc<Product>('getProduct', [productId]);
  return r.ok && r.value.inStock;
}

export async function greeting(customerId: number): Promise<string> {
  const r = await rpc<Customer>('getCustomer', [customerId]);
  if (!r.ok) return 'error: ' + r.error;
  return `Hello, ${r.value.name} (${r.value.tier})`;
}

export async function contactLine(customerId: number): Promise<string> {
  const r = await rpc<Customer>('getCustomer', [customerId]);
  if (!r.ok) return 'error: ' + r.error;
  return `${r.value.name} <${r.value.email}>`;
}

export async function quoteSummary(productId: number, quantity: number, customerId: number, coupon: string): Promise<string> {
  const r = await rpc<Quote>('getQuote', [productId, quantity, coupon, customerId]);
  if (!r.ok) return 'error: ' + r.error;
  const q = r.value;
  return `${q.quantity} x ${q.product.name} = ${formatCents(q.totalCents)}${discountNote(q.discountPercent)}`;
}

export async function receiptText(productId: number, quantity: number, customerId: number, coupon: string): Promise<string> {
  const r = await rpc<Receipt>('checkout', [productId, quantity, coupon, customerId]);
  if (!r.ok) return 'error: ' + r.error;
  const { customer, quote, signature } = r.value;
  return `Receipt for ${customer.name}: ${quote.quantity} x ${quote.product.name}, total ${formatCents(quote.totalCents)} [${signature}]`;
}
