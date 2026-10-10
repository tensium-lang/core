// The catalog and directory screens: the list of products with prices, a product search, the
// customers in a region, and the aging report.

import type { Customer, Product } from '../../shared/types.ts';
import { formatCents } from '../format.ts';
import { rpc } from '../rpc.ts';

type AgingBuckets = { current: number; days1to30: number; days31to60: number; days61to90: number; over90: number };

export async function catalogView(): Promise<string> {
  const r = await rpc<Product[]>('listProducts', []);
  if (!r.ok) return 'error: ' + r.error;
  return r.value.map((p) => `${p.name} - ${formatCents(p.unitCents)}${p.taxable ? ' (taxable)' : ''}`).join('\n');
}

export async function searchView(text: string): Promise<string> {
  const r = await rpc<Product[]>('searchProducts', [text]);
  if (!r.ok) return 'error: ' + r.error;
  if (r.value.length === 0) return 'No products match';
  return r.value.map((p) => `${p.name} - ${formatCents(p.unitCents)}`).join('\n');
}

export async function regionView(region: string): Promise<string> {
  const r = await rpc<Customer[]>('customersInRegion', [region]);
  if (!r.ok) return 'error: ' + r.error;
  return r.value.map((c) => `${c.name} (net ${c.termsDays})`).join('\n');
}

export async function agingView(): Promise<string> {
  const r = await rpc<AgingBuckets>('agingReport', []);
  if (!r.ok) return 'error: ' + r.error;
  const b = r.value;
  return [
    `Current: ${formatCents(b.current)}`,
    `1-30 days: ${formatCents(b.days1to30)}`,
    `31-60 days: ${formatCents(b.days31to60)}`,
    `61-90 days: ${formatCents(b.days61to90)}`,
    `Over 90 days: ${formatCents(b.over90)}`,
  ].join('\n');
}
