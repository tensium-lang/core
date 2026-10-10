// The record types that the shop's server and client both use, kept in one place.

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export type Product = { id: number; name: string; priceCents: number; inStock: boolean };
export type Customer = { id: number; name: string; email: string | null; tier: string };
export type Quote = { product: Product; quantity: number; discountPercent: number; totalCents: number };
export type Receipt = { customer: Customer; quote: Quote; signature: string };
