// Two tiny helpers for building a Result: ok(value) for success and err(message) for failure.
// The rest of the server uses these instead of throwing.

export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
export const err = <E>(error: E): { ok: false; error: E } => ({ ok: false, error });
