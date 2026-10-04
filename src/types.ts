// This file describes the kinds of values in Tensium (number, string, boolean, void, null,
// Result and "maybe null") and the rules for when one kind can be used where another is
// expected. For example, a plain number fits where "number or null" is wanted, but not
// the other way around.

export type Ty =
  | { k: 'number' | 'string' | 'boolean' | 'void' | 'null' | 'unknown' }
  | { k: 'result'; ok: Ty; err: Ty }
  | { k: 'nullable'; inner: Ty };

export const T = {
  number: { k: 'number' } as Ty,
  string: { k: 'string' } as Ty,
  boolean: { k: 'boolean' } as Ty,
  void: { k: 'void' } as Ty,
  null: { k: 'null' } as Ty,
  unknown: { k: 'unknown' } as Ty,
  result: (ok: Ty, err: Ty): Ty => ({ k: 'result', ok, err }),
  nullable: (inner: Ty): Ty => ({ k: 'nullable', inner }),
};

export function tyStr(t: Ty): string {
  switch (t.k) {
    case 'result': return `Result<${tyStr(t.ok)}, ${tyStr(t.err)}>`;
    case 'nullable': return `${tyStr(t.inner)} | null`;
    case 'unknown': return '_';
    default: return t.k;
  }
}

export function isComplete(t: Ty): boolean {
  switch (t.k) {
    case 'unknown': return false;
    case 'result': return isComplete(t.ok) && isComplete(t.err);
    case 'nullable': return isComplete(t.inner);
    default: return true;
  }
}

export function assignable(a: Ty, e: Ty): boolean {
  if (a.k === 'unknown' || e.k === 'unknown') return true;
  if (e.k === 'nullable') {
    if (a.k === 'null') return true;
    if (a.k === 'nullable') return assignable(a.inner, e.inner);
    return assignable(a, e.inner);
  }
  if (a.k === 'nullable') return false;
  if (a.k === 'result' && e.k === 'result') return assignable(a.ok, e.ok) && assignable(a.err, e.err);
  return a.k === e.k;
}

/** Least common type of two branch types, or null if they conflict. */
export function unify(a: Ty, b: Ty): Ty | null {
  if (a.k === 'unknown') return b;
  if (b.k === 'unknown') return a;
  if (a.k === 'null' && b.k === 'null') return a;
  if (a.k === 'null') return b.k === 'nullable' ? b : T.nullable(b);
  if (b.k === 'null') return a.k === 'nullable' ? a : T.nullable(a);
  if (a.k === 'nullable' || b.k === 'nullable') {
    const i = unify(a.k === 'nullable' ? a.inner : a, b.k === 'nullable' ? b.inner : b);
    return i && T.nullable(i);
  }
  if (a.k === 'result' && b.k === 'result') {
    const ok = unify(a.ok, b.ok), err = unify(a.err, b.err);
    return ok && err ? T.result(ok, err) : null;
  }
  return a.k === b.k ? a : null;
}
