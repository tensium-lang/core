// This file lists the ready-made tools every Tensium program can use without writing them,
// like parseInt (turn text into a number), len (count letters) and str (turn a number
// into text). Each tool is listed with what it takes in and what it gives back, next to
// the real code that makes it work, so the two can never disagree.

import { T, Ty } from './types.ts';

/** Builtins: signature and TypeScript implementation live together so they cannot drift. */
export interface Builtin {
  params: Ty[];
  ret: Ty;
  impl: string;
  /** Server-only builtins can only be called from a `server fn`, and are never written into the client file. */
  side?: 'server';
}

const S = T.string, N = T.number, B = T.boolean;

export const PRELUDE: Record<string, Builtin> = {
  parseInt: {
    params: [S], ret: T.result(N, S),
    impl: '(s: string): Result<number, string> => /^-?\\d+$/.test(s) ? __ok(parseInt(s, 10)) : __err("not an integer: " + s)',
  },
  parseFloat: {
    params: [S], ret: T.result(N, S),
    impl: '(s: string): Result<number, string> => /^-?\\d+(\\.\\d+)?$/.test(s) ? __ok(parseFloat(s)) : __err("not a number: " + s)',
  },
  len: { params: [S], ret: N, impl: '(s: string): number => s.length' },
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
