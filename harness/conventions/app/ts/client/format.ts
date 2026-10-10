// Small text helpers for the client's screens: money as "$12.50", a status as a word, and a
// discount as "(10% off)".

import type { Cents, Status } from '../shared/types.ts';

export function formatCents(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}$${dollars}.${rest < 10 ? '0' : ''}${rest}`;
}

export function statusWord(s: Status): string {
  switch (s) {
    case 'draft': return 'draft';
    case 'sent': return 'sent';
    case 'paid': return 'paid';
    case 'void': return 'void';
  }
}

export function discountNote(percent: number): string {
  return percent === 0 ? '' : ` (${percent}% off)`;
}
