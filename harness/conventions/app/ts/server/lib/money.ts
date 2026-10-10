// Money arithmetic for the server. Every amount is a whole number of cents, and every percentage
// goes through percentOf, which uses whole-number maths and rounds halves to the nearest even cent
// (so 4.5 cents becomes 4 and 5.5 becomes 6). That way every part of the app rounds the same way.

import type { Cents } from '../../shared/types.ts';

/**
 * `basisPoints` of `amount`: 100 basis points = 1 %, so percentOf(amount, 150) is 1.5 % of it.
 * Rounds half to even using integer arithmetic only.
 */
export function percentOf(amount: Cents, basisPoints: number): Cents {
  const numerator = amount * basisPoints;
  const whole = Math.trunc(numerator / 10000);
  const remainder = numerator - whole * 10000;
  const twice = Math.abs(remainder) * 2;
  const sign = numerator < 0 ? -1 : 1;
  if (twice < 10000) return whole;
  if (twice > 10000) return whole + sign;
  return whole % 2 === 0 ? whole : whole + sign;
}

export function sumCents(amounts: Cents[]): Cents {
  let total = 0;
  for (const a of amounts) total += a;
  return total;
}

/** "$12.50" style text, used in server-composed messages such as reminders. */
export function formatCents(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}$${dollars}.${rest < 10 ? '0' : ''}${rest}`;
}
