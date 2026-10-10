// The server's front door. It lists every function the client may call, and starts the HTTP
// server that answers "POST /rpc/<name>" with a JSON array of arguments by calling that function
// and sending its result back as JSON.

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { agingReport } from './aging.ts';
import { customersInRegion, listProducts, searchProducts } from './catalog.ts';
import { creditsFor } from './credits.ts';
import { customerInvoices, getCustomer, getProduct } from './customers.ts';
import { getInvoice, invoiceTotals } from './invoices.ts';
import { paymentsFor } from './payments.ts';
import { reminderText } from './reminders.ts';
import { dashboardStats, overdueInvoices } from './reports.ts';
import { signedReceipt } from './webhooks.ts';

const routes: Record<string, (args: unknown[]) => unknown> = {
  getCustomer: (a) => getCustomer(a[0] as number),
  getProduct: (a) => getProduct(a[0] as number),
  getInvoice: (a) => getInvoice(a[0] as number),
  invoiceTotals: (a) => invoiceTotals(a[0] as number),
  customerInvoices: (a) => customerInvoices(a[0] as number),
  paymentsFor: (a) => paymentsFor(a[0] as number),
  creditsFor: (a) => creditsFor(a[0] as number),
  reminderText: (a) => reminderText(a[0] as number),
  dashboardStats: () => dashboardStats(),
  overdueInvoices: () => overdueInvoices(),
  signedReceipt: (a) => signedReceipt(a[0] as number),
  listProducts: () => listProducts(),
  searchProducts: (a) => searchProducts(a[0] as string),
  customersInRegion: (a) => customersInRegion(a[0] as string),
  agingReport: () => agingReport(),
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
