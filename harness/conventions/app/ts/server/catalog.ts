// The product catalog and the customer directory on the server: every product, products whose
// name contains some text, and the customers in a region.

import type { Customer, Product, Result } from '../shared/types.ts';
import { CUSTOMERS, PRODUCTS } from './data.ts';
import { err, ok } from './lib/result.ts';

export function listProducts(): Result<Product[], string> {
  return ok(PRODUCTS);
}

/** Products whose name contains the text, ignoring case. An empty search is an error. */
export function searchProducts(text: string): Result<Product[], string> {
  const needle = text.trim().toLowerCase();
  if (needle === '') return err('search text is empty');
  return ok(PRODUCTS.filter((p) => p.name.toLowerCase().includes(needle)));
}

export function customersInRegion(region: string): Result<Customer[], string> {
  const found = CUSTOMERS.filter((c) => c.region === region);
  if (found.length === 0) return err('no customers in region ' + region);
  return ok(found);
}
