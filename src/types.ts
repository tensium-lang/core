// This file describes the kinds of values in Tensium (number, string, boolean, void, null,
// Result, "maybe null", lists, records with named fields, enums with a fixed set of names,
// newtypes that wrap a plain value so it cannot be mixed up with another, and server-only
// secrets) and the rules for when one kind can be used where another is expected. For example,
// a plain number fits where "number or null" is wanted, but not the other way around.

export type Ty =
  | { k: 'number' | 'string' | 'boolean' | 'void' | 'null' | 'unknown' | 'secret' }
  | { k: 'result'; ok: Ty; err: Ty }
  | { k: 'nullable'; inner: Ty }
  | { k: 'list'; elem: Ty }
  | { k: 'record'; name?: string; fields: [string, Ty][] }
  | { k: 'enum'; name: string; members: string[] }
  | { k: 'newtype'; name: string; inner: Ty };

export const T = {
  number: { k: 'number' } as Ty,
  string: { k: 'string' } as Ty,
  boolean: { k: 'boolean' } as Ty,
  void: { k: 'void' } as Ty,
  null: { k: 'null' } as Ty,
  unknown: { k: 'unknown' } as Ty,
  secret: { k: 'secret' } as Ty,
  result: (ok: Ty, err: Ty): Ty => ({ k: 'result', ok, err }),
  nullable: (inner: Ty): Ty => ({ k: 'nullable', inner }),
  list: (elem: Ty): Ty => ({ k: 'list', elem }),
};

export function tyStr(t: Ty): string {
  switch (t.k) {
    case 'result': return `Result<${tyStr(t.ok)}, ${tyStr(t.err)}>`;
    case 'nullable': return `${tyStr(t.inner)} | null`;
    case 'list': return `List<${tyStr(t.elem)}>`;
    case 'unknown': return '_';
    case 'secret': return 'Secret';
    case 'record': return t.name ?? `{ ${t.fields.map(([n, f]) => `${n}: ${tyStr(f)}`).join(', ')} }`;
    case 'enum': case 'newtype': return t.name;
    default: return t.k;
  }
}

/** True if a value of this type could carry a secret (directly or inside a record, list or Result). */
export function containsSecret(t: Ty): boolean {
  switch (t.k) {
    case 'secret': return true;
    case 'result': return containsSecret(t.ok) || containsSecret(t.err);
    case 'nullable': return containsSecret(t.inner);
    case 'list': return containsSecret(t.elem);
    case 'record': return t.fields.some(([, f]) => containsSecret(f));
    case 'newtype': return containsSecret(t.inner);
    default: return false;
  }
}

export function isComplete(t: Ty): boolean {
  switch (t.k) {
    case 'unknown': return false;
    case 'result': return isComplete(t.ok) && isComplete(t.err);
    case 'nullable': return isComplete(t.inner);
    case 'list': return isComplete(t.elem);
    case 'record': return t.fields.every(([, f]) => isComplete(f));
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
  if (a.k === 'list' && e.k === 'list') return assignable(a.elem, e.elem);
  if (a.k === 'record' && e.k === 'record') {
    // records match by shape: exactly the same field names, each one assignable
    if (a.fields.length !== e.fields.length) return false;
    const want = new Map(e.fields);
    return a.fields.every(([n, f]) => want.has(n) && assignable(f, want.get(n)!));
  }
  // enums and newtypes match by name only: a Cents is never a number, and never a different newtype
  if (a.k === 'enum' || a.k === 'newtype') return a.k === e.k && a.name === e.name;
  if (e.k === 'enum' || e.k === 'newtype') return false;
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
  if (a.k === 'list' && b.k === 'list') {
    const e = unify(a.elem, b.elem);
    return e && T.list(e);
  }
  if (a.k === 'record' && b.k === 'record') {
    if (assignable(a, b) && assignable(b, a)) return a.name ? a : b;
    if (assignable(a, b)) return b;
    return assignable(b, a) ? a : null;
  }
  return assignable(a, b) && assignable(b, a) ? a : null;
}
