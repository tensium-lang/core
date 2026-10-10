// This file is a list of the kinds of building blocks a Tensium program is made from,
// like a box of LEGO pieces: numbers, words, lists, function calls, "if" choices, loops, and so on.
// The parser snaps the pieces together from the code a person writes, and the other
// steps (the checker and the writer) look at the pieces to do their jobs.

import { Loc } from './diagnostics.ts';

export type TypeNode =
  | { kind: 'TypeName'; name: string; loc: Loc }
  | { kind: 'TypeResult'; ok: TypeNode; err: TypeNode; loc: Loc }
  | { kind: 'TypeList'; elem: TypeNode; loc: Loc }
  | { kind: 'TypeNullable'; inner: TypeNode; nullLoc: Loc; viaUndefined: boolean; loc: Loc };

export type Expr =
  | { kind: 'Num'; value: number; loc: Loc }
  | { kind: 'Str'; value: string; loc: Loc }
  | { kind: 'Bool'; value: boolean; loc: Loc }
  | { kind: 'Null'; loc: Loc }
  | { kind: 'Undef'; loc: Loc }
  | { kind: 'Ident'; name: string; loc: Loc }
  | { kind: 'Call'; name: string; nameLoc: Loc; args: Expr[]; loc: Loc }
  | { kind: 'Unary'; op: '!' | '-'; expr: Expr; loc: Loc }
  | { kind: 'Binary'; op: string; left: Expr; right: Expr; loc: Loc }
  | { kind: 'Field'; obj: Expr; name: string; nameLoc: Loc; loc: Loc }
  | { kind: 'List'; items: Expr[]; loc: Loc }
  /** `Status.Draft`: the checker turns a field access on an enum's name into this. */
  | { kind: 'EnumVal'; enumName: string; member: string; loc: Loc }
  /** `cents.value` on a newtype: the checker turns it into this; `inner` is the TypeScript name of the wrapped type. */
  | { kind: 'Unwrap'; expr: Expr; inner: string; loc: Loc }
  | RecordExpr
  | IfExpr
  | MatchExpr;

export interface RecordField { name: string; nameLoc: Loc; value: Expr }

/** A record value: `{ id: 1, name: "Ann" }`, or a copy with changes: `{ ...user, name: "Bo" }`. */
export interface RecordExpr { kind: 'Record'; spread?: Expr; fields: RecordField[]; loc: Loc }

export interface IfExpr { kind: 'If'; cond: Expr; then: Block; else?: Block | IfExpr; loc: Loc }

/** `ok(v) => ...` / `err(e) => ...` for a Result, or `Draft => ...` for an enum (no binding). */
export interface Arm { pat: string; patLoc: Loc; bind?: string; bindLoc?: Loc; body: Block; loc: Loc }

export interface MatchExpr {
  kind: 'Match';
  scrut: Expr;
  arms: Arm[];
  headLoc: Loc; // `match <scrutinee>`
  closeLoc: Loc; // the closing brace
  loc: Loc;
}

/** `tail` is a trailing expression without `;` — the block's value. */
export interface Block { kind: 'Block'; stmts: Stmt[]; tail?: Expr; loc: Loc; closeLoc: Loc }

export type Stmt =
  | { kind: 'Let'; mut: boolean; name: string; nameLoc: Loc; typeNode?: TypeNode; init: Expr; loc: Loc }
  | { kind: 'Assign'; name: string; nameLoc: Loc; expr: Expr; loc: Loc }
  | { kind: 'For'; name: string; nameLoc: Loc; iter: Expr; body: Block; loc: Loc }
  | { kind: 'While'; cond: Expr; body: Block; loc: Loc }
  | { kind: 'Return'; expr?: Expr; loc: Loc }
  | { kind: 'ExprStmt'; expr: Expr; loc: Loc }
  | { kind: 'Throw'; expr: Expr; loc: Loc }
  | { kind: 'Try'; loc: Loc };

export interface Param { name: string; nameLoc: Loc; typeNode?: TypeNode }

/** Where a function runs. `shared` functions are plain helpers that run on either side. */
export type Side = 'server' | 'client' | 'shared';

export interface Fn {
  side: Side;
  /** The `fn` keyword (a side marker, if any, sits just before it). */
  fnLoc: Loc;
  name: string;
  nameLoc: Loc;
  params: Param[];
  retNode?: TypeNode;
  rparenLoc: Loc;
  body: Block;
  loc: Loc;
}

export interface TypeField { name: string; nameLoc: Loc; typeNode: TypeNode }

/** `type User = { id: number, name: string }` */
export interface TypeDecl { name: string; nameLoc: Loc; fields: TypeField[]; loc: Loc }

/** `enum Status { Draft, Sent, Paid }` */
export interface EnumDecl { name: string; nameLoc: Loc; members: { name: string; loc: Loc }[]; loc: Loc }

/** `newtype Cents = number;` — a number (or string, or boolean) that cannot be mixed up with any other. */
export interface NewtypeDecl { name: string; nameLoc: Loc; typeNode: TypeNode; loc: Loc }

export interface Program { types: TypeDecl[]; enums: EnumDecl[]; newtypes: NewtypeDecl[]; fns: Fn[] }
