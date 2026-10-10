// This file lists the ready-made tools every Tensium program can use without writing them,
// like parseInt (turn text into a number), len (count letters or items) and str (turn a number
// into text). Each tool is listed with what it takes in and what it gives back, next to
// the real code that makes it work, so the two can never disagree. A few tools work on lists
// of any kind of value; those work out their exact types from the arguments they are given.

import { T, Ty } from './types.ts';

/** Builtins: signature and TypeScript implementation live together so they cannot drift. */
export interface Builtin {
  params: Ty[];
  ret: Ty;
  impl: string;
  /** Server-only builtins can only be called from a `server fn`, and are never written into the client file. */
  side?: 'server';
  /** How the signature is shown in the language reference, for tools whose types depend on their arguments. */
  sig?: string;
  /** For tools that work on lists of any kind: the exact signature for these argument types, or null if they do not fit. */
  generic?: (args: Ty[]) => { params: Ty[]; ret: Ty } | null;
}

const S = T.string, N = T.number, B = T.boolean;
const elemOf = (t: Ty | undefined): Ty | null => (t === undefined ? null : t.k === 'list' ? t.elem : t.k === 'unknown' ? T.unknown : null);

export const PRELUDE: Record<string, Builtin> = {
  parseInt: {
    params: [S], ret: T.result(N, S),
    impl: '(s: string): Result<number, string> => /^-?\\d+$/.test(s) ? __ok(parseInt(s, 10)) : __err("not an integer: " + s)',
  },
  parseFloat: {
    params: [S], ret: T.result(N, S),
    impl: '(s: string): Result<number, string> => /^-?\\d+(\\.\\d+)?$/.test(s) ? __ok(parseFloat(s)) : __err("not a number: " + s)',
  },
  len: {
    params: [S], ret: N, sig: 'len(string | List<T>): number',
    impl: '(s: string | unknown[]): number => s.length',
    generic: (a) => (a[0]?.k === 'list' ? { params: [a[0]], ret: N } : { params: [S], ret: N }),
  },
  contains: { params: [S, S], ret: B, impl: '(s: string, sub: string): boolean => s.includes(sub)' },
  startsWith: { params: [S, S], ret: B, impl: '(s: string, p: string): boolean => s.startsWith(p)' },
  endsWith: { params: [S, S], ret: B, impl: '(s: string, p: string): boolean => s.endsWith(p)' },
  indexOf: { params: [S, S], ret: N, impl: '(s: string, sub: string): number => s.indexOf(sub)' },
  substring: { params: [S, N, N], ret: S, impl: '(s: string, a: number, b: number): string => s.substring(a, b)' },
  toUpper: { params: [S], ret: S, impl: '(s: string): string => s.toUpperCase()' },
  toLower: { params: [S], ret: S, impl: '(s: string): string => s.toLowerCase()' },
  trim: { params: [S], ret: S, impl: '(s: string): string => s.trim()' },
  str: { params: [N], ret: S, impl: '(n: number): string => String(n)' },
  abs: { params: [N], ret: N, impl: '(n: number): number => Math.abs(n)' },
  min: { params: [N, N], ret: N, impl: '(a: number, b: number): number => Math.min(a, b)' },
  max: { params: [N, N], ret: N, impl: '(a: number, b: number): number => Math.max(a, b)' },
  floor: { params: [N], ret: N, impl: '(n: number): number => Math.floor(n)' },
  // ---- lists (a list never changes: push and concat give back a new list)
  get: {
    params: [T.list(T.unknown), N], ret: T.nullable(T.unknown), sig: 'get(List<T>, number): T | null',
    impl: '<T>(xs: T[], i: number): T | null => (i >= 0 && i < xs.length ? xs[i] : null)',
    generic: (a) => { const e = elemOf(a[0]); return e && { params: [T.list(e), N], ret: T.nullable(e) }; },
  },
  push: {
    params: [T.list(T.unknown), T.unknown], ret: T.list(T.unknown), sig: 'push(List<T>, T): List<T>',
    impl: '<T>(xs: T[], x: T): T[] => [...xs, x]',
    generic: (a) => { const e = elemOf(a[0]); return e && { params: [T.list(e), e.k === 'unknown' ? (a[1] ?? e) : e], ret: T.list(e.k === 'unknown' ? (a[1] ?? e) : e) }; },
  },
  concat: {
    params: [T.list(T.unknown), T.list(T.unknown)], ret: T.list(T.unknown), sig: 'concat(List<T>, List<T>): List<T>',
    impl: '<T>(xs: T[], ys: T[]): T[] => [...xs, ...ys]',
    generic: (a) => { const e = elemOf(a[0]); return e && { params: [T.list(e), T.list(e)], ret: T.list(e) }; },
  },
  has: {
    params: [T.list(T.unknown), T.unknown], ret: B, sig: 'has(List<T>, T): boolean   (numbers, strings, booleans and enum values)',
    impl: '<T>(xs: T[], x: T): boolean => xs.includes(x)',
    generic: (a) => { const e = elemOf(a[0]); return e && { params: [T.list(e), e], ret: B }; },
  },
  join: { params: [T.list(S), S], ret: S, impl: '(xs: string[], sep: string): string => xs.join(sep)' },
  range: {
    params: [N, N], ret: T.list(N),
    impl: '(a: number, b: number): number[] => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i)',
  },
  // ---- server-only
  secret: {
    params: [S], ret: T.secret, side: 'server',
    impl: "(name: string): Secret => (process.env[name] ?? '') as Secret",
  },
  sign: {
    params: [T.secret, S], ret: S, side: 'server',
    impl: "(key: Secret, message: string): string => createHmac('sha256', key).update(message).digest('hex').slice(0, 16)",
  },
};
