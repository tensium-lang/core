// This file is a list of the kinds of building blocks a Tensium program is made from,
// like a box of LEGO pieces: numbers, words, function calls, "if" choices, and so on.
// The parser snaps the pieces together from the code a person writes, and the other
// steps (the checker and the writer) look at the pieces to do their jobs.

import { Loc } from './diagnostics.ts';

export type TypeNode =
  | { kind: 'TypeName'; name: string; loc: Loc }
  | { kind: 'TypeResult'; ok: TypeNode; err: TypeNode; loc: Loc }
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
  | IfExpr
  | MatchExpr;

export interface IfExpr { kind: 'If'; cond: Expr; then: Block; else?: Block | IfExpr; loc: Loc }

export interface Arm { pat: string; patLoc: Loc; bind: string; bindLoc: Loc; body: Block; loc: Loc }

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
  | { kind: 'Let'; name: string; nameLoc: Loc; typeNode?: TypeNode; init: Expr; loc: Loc }
  | { kind: 'Return'; expr?: Expr; loc: Loc }
  | { kind: 'ExprStmt'; expr: Expr; loc: Loc }
  | { kind: 'Throw'; expr: Expr; loc: Loc }
  | { kind: 'Try'; loc: Loc };

export interface Param { name: string; nameLoc: Loc; typeNode?: TypeNode }

export interface Fn {
  name: string;
  nameLoc: Loc;
  params: Param[];
  retNode?: TypeNode;
  rparenLoc: Loc;
  body: Block;
  loc: Loc;
}

export interface Program { fns: Fn[] }
