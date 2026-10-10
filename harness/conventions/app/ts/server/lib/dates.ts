// Date helpers that work on "YYYY-MM-DD" text without time zones. They turn a date into a
// count of days (so dates can be added and subtracted) and back again, using whole-number maths,
// so "30 days after 2026-08-20" always means the same day everywhere.

/** Days since 1970-01-01 for a "YYYY-MM-DD" date. */
export function toDays(iso: string): number {
  const y0 = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The "YYYY-MM-DD" date that is `days` days after 1970-01-01. */
export function fromDays(days: number): string {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  const pad = (n: number) => (n < 10 ? '0' : '') + n;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function addDays(iso: string, days: number): string {
  return fromDays(toDays(iso) + days);
}

/** How many days `b` is after `a` (negative if before). */
export function daysBetween(a: string, b: string): number {
  return toDays(b) - toDays(a);
}

export function isAfter(a: string, b: string): boolean {
  return toDays(a) > toDays(b);
}
