// The server half of a small shop app. It knows the products, the customers and the prices,
// signs each receipt with a secret key, and answers the client's requests over HTTP.

import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Customer, Product, Quote, Receipt, Result } from './types.ts';

const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
const err = <E>(error: E): { ok: false; error: E } => ({ ok: false, error });

function discountFor(tier: string): number {
  if (tier === 'gold') return 20;
  if (tier === 'silver') return 10;
  return 0;
}

function sign(message: string): string {
  const key = process.env.SIGNING_KEY ?? '';
  return createHmac('sha256', key).update(message).digest('hex').slice(0, 16);
}

export function getProduct(id: number): Result<Product, string> {
  if (id === 1) return ok({ id: 1, name: 'Widget', priceCents: 1250, currency: 'USD', inStock: true });
  if (id === 2) return ok({ id: 2, name: 'Gadget', priceCents: 9999, currency: 'EUR', inStock: false });
  if (id === 3) return ok({ id: 3, name: 'Gizmo', priceCents: 500, currency: 'EUR', inStock: true });
  return err('no such product');
}

export function getCustomer(id: number): Result<Customer, string> {
  if (id === 1) return ok({ id: 1, name: 'Ann Lee', email: 'ann@example.com', tier: 'gold' });
  if (id === 2) return ok({ id: 2, name: 'Bo Chen', email: 'bo@example.com', tier: 'silver' });
  if (id === 3) return ok({ id: 3, name: 'Cy Young', email: 'cy@example.com', tier: 'basic' });
  return err('no such customer');
}

export function getQuote(productId: number, quantity: number, customerId: number): Result<Quote, string> {
  if (quantity < 1) return err('quantity must be at least 1');
  const product = getProduct(productId);
  if (!product.ok) return product;
  const customer = getCustomer(customerId);
  if (!customer.ok) return customer;
  if (!product.value.inStock) return err('out of stock');
  const discount = discountFor(customer.value.tier);
  const full = product.value.priceCents * quantity;
  const total = full - Math.floor((full * discount) / 100);
  return ok({ product: product.value, quantity, discountPercent: discount, totalCents: total });
}

export function checkout(productId: number, quantity: number, customerId: number): Result<Receipt, string> {
  const quote = getQuote(productId, quantity, customerId);
  if (!quote.ok) return quote;
  const customer = getCustomer(customerId);
  if (!customer.ok) return customer;
  const signature = sign(`${customer.value.id}:${quote.value.product.id}:${quote.value.totalCents}`);
  return ok({ customer: customer.value, quote: quote.value, signature });
}

// ---- HTTP: POST /rpc/<name> with a JSON array of arguments; the reply is the function's result as JSON.

const routes: Record<string, (args: any[]) => unknown> = {
  getProduct: (a) => getProduct(a[0]),
  getCustomer: (a) => getCustomer(a[0]),
  getQuote: (a) => getQuote(a[0], a[1], a[2]),
  checkout: (a) => checkout(a[0], a[1], a[2]),
};

/** Starts the server (port 0 picks a free port). */
export function serve(port = 0): Promise<{ port: number; url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const name = /^\/rpc\/(\w+)$/.exec(req.url ?? '')?.[1];
    const route = name ? routes[name] : undefined;
    if (req.method !== 'POST' || !route) { res.writeHead(404).end(); return; }
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const out = route(JSON.parse(body));
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
      } catch {
        res.writeHead(400).end();
      }
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const actual = (server.address() as AddressInfo).port;
    resolve({ port: actual, url: `http://127.0.0.1:${actual}`, close: () => new Promise<void>((done) => server.close(() => done())) });
  }));
}
