// This file is the rule-checker, the "teacher" that reads a program and marks mistakes.
// It makes sure the program follows Tensium's rules: failures are returned as values
// instead of thrown, every Result is opened with both an ok and an err case, and nothing
// that might be empty (null) gets used before it is checked. Each mistake becomes a
// diagnostic with the exact spot, what was expected, what was found, and a suggested fix.

import { Block, Expr, Fn, IfExpr, MatchExpr, Program, Stmt, TypeNode } from './ast.ts';
import { Diagnostic, FixSpec, Loc, mkDiag } from './diagnostics.ts';
import { PRELUDE } from './prelude.ts';
import { T, Ty, assignable, isComplete, tyStr, unify } from './types.ts';

class Var {
  used = false;
  constructor(public name: string, public ty: Ty, public loc: Loc, public isLet: boolean, public orig?: Var) {}
}

class Scope {
  vars = new Map<string, Var>();
  constructor(public parent?: Scope) {}
  lookup(name: string): Var | undefined {
    return this.vars.get(name) ?? this.parent?.lookup(name);
  }
  names(): string[] {
    return [...this.vars.keys(), ...(this.parent?.names() ?? [])];
  }
}

const markUsed = (v: Var): void => { v.used = true; if (v.orig) markUsed(v.orig); };

interface Sig { params: Ty[]; ret: Ty | null }
interface FnCtx { ret: Ty | null; retTys: Ty[] }

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const nearest = (name: string, cands: string[]): string | undefined => {
  let best: string | undefined, bd = Infinity;
  for (const c of cands) { const d = lev(name, c); if (d < bd) { bd = d; best = c; } }
  return best !== undefined && bd <= Math.max(1, Math.floor(name.length / 3)) ? best : undefined;
};

type Narrow = { t: string[]; f: string[] };

function narrowings(e: Expr): Narrow {
  const none: Narrow = { t: [], f: [] };
  if (e.kind === 'Unary' && e.op === '!') { const n = narrowings(e.expr); return { t: n.f, f: n.t }; }
  if (e.kind !== 'Binary') return none;
  if (e.op === '&&') return { t: [...narrowings(e.left).t, ...narrowings(e.right).t], f: [] };
  if (e.op === '||') return { t: [], f: [...narrowings(e.left).f, ...narrowings(e.right).f] };
  if (['!==', '!=', '===', '=='].includes(e.op)) {
    const id = e.left.kind === 'Ident' && e.right.kind === 'Null' ? e.left
      : e.right.kind === 'Ident' && e.left.kind === 'Null' ? e.right : null;
    if (!id || id.kind !== 'Ident') return none;
    return e.op.startsWith('!') ? { t: [id.name], f: [] } : { t: [], f: [id.name] };
  }
  return none;
}

function exprReturns(e: Expr): boolean {
  if (e.kind === 'If') {
    if (!e.else) return false;
    return blockReturns(e.then) && (e.else.kind === 'If' ? exprReturns(e.else) : blockReturns(e.else));
  }
  if (e.kind === 'Match') return e.arms.length > 0 && e.arms.every((a) => blockReturns(a.body));
  return false;
}
function stmtReturns(s: Stmt): boolean {
  return s.kind === 'Return' || s.kind === 'Throw' || (s.kind === 'ExprStmt' && exprReturns(s.expr));
}
function blockReturns(b: Block): boolean {
  return b.stmts.some(stmtReturns) || (!!b.tail && exprReturns(b.tail));
}

class Checker {
  diags: Diagnostic[] = [];
  fns = new Map<string, Sig>();
  fnNodes = new Map<Fn, Sig>();
  cur: FnCtx = { ret: null, retTys: [] };
  valueDepth = 0;
  /** Counts invalid-value-block errors so enclosing blocks can go quiet instead of piling on follow-on type errors. */
  taint = 0;
  lines: string[];

  constructor(private src: string, private file: string) { this.lines = src.split('\n'); }

  txt(l: Loc): string { return this.src.slice(l.so, l.eo); }
  indent(line: number): string { return /^\s*/.exec(this.lines[line - 1] ?? '')![0]; }
  err(code: string, message: string, loc: Loc, o: { expected?: string; actual?: string; fix?: FixSpec } = {}): void {
    this.diags.push(mkDiag(code, message, loc, o));
  }
  zeroAt(l: Loc): Loc { return { ...l, endLine: l.startLine, endCol: l.startCol, eo: l.so }; }

  // ---- types
  resolveType(n: TypeNode): Ty {
    switch (n.kind) {
      case 'TypeResult': return T.result(this.resolveType(n.ok), this.resolveType(n.err));
      case 'TypeNullable': {
        if (n.viaUndefined) {
          this.err('TN3002', "'undefined' is not allowed; use 'null' for absent values.", n.nullLoc, {
            expected: 'null', actual: 'undefined',
            fix: { description: "Replace 'undefined' with 'null'", edit: { loc: n.nullLoc, newText: 'null' } },
          });
        }
        const i = this.resolveType(n.inner);
        return i.k === 'nullable' || i.k === 'unknown' ? i : T.nullable(i);
      }
      case 'TypeName':
        switch (n.name) {
          case 'number': case 'string': case 'boolean': case 'void': return T[n.name];
          case 'null': return T.null;
          case 'any':
            this.err('TN3001', "Explicit 'any' is not allowed.", n.loc, {
              expected: 'a concrete type', actual: 'any',
              fix: { description: "Replace 'any' with a specific type such as number, string, boolean, or Result<T, E>" },
            });
            return T.unknown;
          case 'undefined':
            this.err('TN3002', "'undefined' is not allowed; use 'null' for absent values.", n.loc, {
              expected: 'null', actual: 'undefined',
              fix: { description: "Replace 'undefined' with 'null'", edit: { loc: n.loc, newText: 'null' } },
            });
            return T.null;
          case 'Result':
            this.err('TN0011', "Result requires two type arguments: Result<T, E>.", n.loc, { expected: 'Result<T, E>', actual: 'Result' });
            return T.unknown;
          default: {
            const s = nearest(n.name, ['number', 'string', 'boolean', 'void', 'Result']);
            this.err('TN0004', `Cannot find type '${n.name}'.`, n.loc, {
              expected: 'number | string | boolean | void | null | Result<T, E>', actual: n.name,
              fix: s ? { description: `Did you mean '${s}'?`, edit: { loc: n.loc, newText: s } } : { description: 'Use one of: number, string, boolean, void, null, Result<T, E>' },
            });
            return T.unknown;
          }
        }
    }
  }

  // ---- program
  run(p: Program): Diagnostic[] {
    for (const fn of p.fns) {
      if (PRELUDE[fn.name] || fn.name === 'ok' || fn.name === 'err' || this.fns.has(fn.name)) {
        this.err('TN0007', PRELUDE[fn.name] || fn.name === 'ok' || fn.name === 'err'
          ? `'${fn.name}' is a builtin and cannot be redefined.` : `Duplicate function '${fn.name}'.`, fn.nameLoc, {
          fix: { description: 'Rename the function' },
        });
      }
      const params = fn.params.map((pa) => {
        if (!pa.typeNode) {
          this.err('TN3001', `Parameter '${pa.name}' implicitly has an 'any' type.`, pa.nameLoc, {
            expected: 'type annotation', actual: 'none',
            fix: { description: `Annotate the parameter, e.g. '${pa.name}: number'` },
          });
          return T.unknown;
        }
        return this.resolveType(pa.typeNode);
      });
      const ret = fn.retNode ? this.resolveType(fn.retNode) : null;
      const sig = { params, ret };
      this.fnNodes.set(fn, sig);
      if (!this.fns.has(fn.name) && !PRELUDE[fn.name]) this.fns.set(fn.name, sig);
    }
    for (const fn of p.fns) this.checkFn(fn);
    return this.diags;
  }

  checkFn(fn: Fn): void {
    const sig = this.fnNodes.get(fn)!;
    const scope = new Scope();
    fn.params.forEach((pa, i) => {
      if (scope.vars.has(pa.name)) this.err('TN0007', `Duplicate parameter '${pa.name}'.`, pa.nameLoc, { fix: { description: 'Rename the parameter' } });
      scope.vars.set(pa.name, new Var(pa.name, sig.params[i], pa.nameLoc, false));
    });
    this.cur = { ret: sig.ret, retTys: [] };
    this.valueDepth = 0;
    this.checkBlock(fn.body, scope, false);
    const ret = sig.ret;
    if (ret && ret.k !== 'void' && ret.k !== 'unknown' && !blockReturns(fn.body)) {
      this.err('TN0006', 'Function lacks ending return statement and return type does not include void.', fn.body.closeLoc, {
        expected: `return of type ${tyStr(ret)}`, actual: 'no return on some path',
        fix: { description: `Make every code path end in 'return <${tyStr(ret)}>;'` },
      });
    }
    if (!ret) {
      const tys = this.cur.retTys;
      let inferred: Ty | null = tys.length === 0 ? T.void : tys.reduce<Ty | null>((a, t) => (a === null ? null : unify(a, t)), tys[0]);
      if (inferred && !isComplete(inferred)) inferred = null;
      const at = { ...fn.rparenLoc, startLine: fn.rparenLoc.endLine, startCol: fn.rparenLoc.endCol, so: fn.rparenLoc.eo };
      this.err('TN3001', `Function '${fn.name}' implicitly has an 'any' return type.`, fn.rparenLoc, {
        expected: 'return type annotation', actual: inferred ? `inferred ${tyStr(inferred)}` : 'none',
        fix: inferred
          ? { description: `Add the return type ': ${tyStr(inferred)}'`, edit: { loc: this.zeroAt(at), newText: `: ${tyStr(inferred)}` } }
          : { description: 'Add an explicit return type annotation' },
      });
    }
  }

  // ---- blocks and statements
  narrow(scope: Scope, name: string): void {
    const v = scope.lookup(name);
    if (v && v.ty.k === 'nullable') scope.vars.set(name, new Var(name, v.ty.inner, v.loc, false, v));
  }

  checkBlock(b: Block, parent: Scope, value: boolean, narrowNames: string[] = [], bindings: Var[] = []): Ty {
    const scope = new Scope(parent);
    for (const v of bindings) scope.vars.set(v.name, v);
    for (const n of narrowNames) this.narrow(scope, n);
    const taint0 = this.taint;
    b.stmts.forEach((s, i) => {
      // a trailing `return X;` in a value block is the common mistake: X should be the block's value
      this.checkStmt(s, scope, value && !b.tail && i === b.stmts.length - 1);
      if (s.kind === 'ExprStmt' && s.expr.kind === 'If' && !s.expr.else && blockReturns(s.expr.then)) {
        for (const n of narrowings(s.expr.cond).f) this.narrow(scope, n);
      }
    });
    let ty: Ty = T.void;
    if (b.tail) {
      if (value) ty = this.checkExpr(b.tail, scope);
      else this.checkExprStmt(b.tail, b.tail.loc, scope);
    }
    if (value && this.taint > taint0) ty = T.unknown; // the real error was already reported; don't cascade
    for (const v of scope.vars.values()) {
      if (v.isLet && v.ty.k === 'result' && !v.used) {
        this.err('TN1002', `Result '${v.name}' is never handled.`, v.loc, {
          expected: 'a match on the Result (or return/pass it on)', actual: `unused ${tyStr(v.ty)}`,
          fix: { description: `Handle both cases: match ${v.name} { ok(v) => ..., err(e) => ... }` },
        });
      }
    }
    return ty;
  }

  checkStmt(s: Stmt, scope: Scope, asValueTail = false): void {
    switch (s.kind) {
      case 'Let': {
        const declared = s.typeNode ? this.resolveType(s.typeNode) : undefined;
        const initTy = this.checkExpr(s.init, scope);
        let ty: Ty;
        if (declared) { this.reportAssign(initTy, declared, s.init); ty = declared; }
        else if (initTy.k === 'void') {
          this.err('TN0002', `Cannot bind '${s.name}' to a void value.`, s.init.loc, { expected: 'a value', actual: 'void' });
          ty = T.unknown;
        } else {
          ty = initTy;
          if (ty.k !== 'unknown' && (!isComplete(ty) || ty.k === 'null')) {
            this.err('TN3001', `Variable '${s.name}' implicitly has type '${tyStr(ty)}' that cannot be fully inferred.`, s.nameLoc, {
              expected: 'type annotation', actual: tyStr(ty),
              fix: { description: `Annotate the binding, e.g. 'let ${s.name}: Result<number, string> = ...'` },
            });
            ty = T.unknown;
          }
        }
        const prev = scope.vars.get(s.name);
        if (prev && !prev.orig) this.err('TN0007', `Duplicate binding '${s.name}' in the same scope.`, s.nameLoc, { fix: { description: 'Rename the binding' } });
        scope.vars.set(s.name, new Var(s.name, ty, s.nameLoc, true));
        return;
      }
      case 'Return': {
        const t = s.expr ? this.checkExpr(s.expr, scope) : T.void;
        const inValue = this.valueDepth > 0;
        if (inValue) {
          this.taint++;
          this.err('TN0010', "'return' is not allowed inside a match arm or if-expression that produces a value.", s.loc, {
            expected: "the block's value as its last expression, without 'return' or ';'", actual: 'return statement',
            fix: asValueTail && s.expr
              ? { description: "Make the returned expression the block's value: remove 'return' and the ';'", edit: { loc: s.loc, newText: this.txt(s.expr.loc) } }
              : { description: "Make the block's last expression (without ';') the value instead of returning" },
          });
        }
        const ret = this.cur.ret;
        if (inValue) { /* already invalid; checking it against the function's return type would only add noise */ }
        else if (ret) {
          if (s.expr) this.reportAssign(t, ret, s.expr);
          else if (ret.k !== 'void' && ret.k !== 'unknown') {
            this.err('TN0002', "A 'return' statement must return a value.", s.loc, { expected: tyStr(ret), actual: 'void' });
          }
        } else this.cur.retTys.push(t);
        return;
      }
      case 'ExprStmt': this.checkExprStmt(s.expr, s.loc, scope); return;
      case 'Throw': {
        this.checkExpr(s.expr, scope);
        const ret = this.cur.ret;
        const canEdit = ret?.k === 'result';
        this.err('TN1001', "'throw' is not allowed; errors are values.", s.loc, {
          expected: 'return err(<error>)', actual: 'throw',
          fix: canEdit
            ? { description: "Return the error as a Result: 'return err(...)'", edit: { loc: s.loc, newText: `return err(${this.txt(s.expr.loc)});` } }
            : { description: "Change this function's return type to Result<T, E> and use 'return err(<error>);' instead of throw" },
        });
        return;
      }
      case 'Try':
        this.err('TN1004', "'try/catch' is not allowed; errors are values.", s.loc, {
          expected: 'Result-returning call handled with match', actual: 'try/catch',
          fix: { description: 'Call a function that returns Result<T, E> and handle it with match { ok(v) => ..., err(e) => ... }' },
        });
        return;
    }
  }

  checkExprStmt(e: Expr, stmtLoc: Loc, scope: Scope): void {
    if (e.kind === 'If') { this.checkIf(e, scope, false); return; }
    if (e.kind === 'Match') { this.checkMatch(e, scope, false); return; }
    const t = this.checkExpr(e, scope);
    if (t.k === 'result') {
      const ind = this.indent(stmtLoc.startLine);
      const ret = this.cur.ret;
      const errArm = ret?.k === 'result' && isComplete(t.err) && assignable(t.err, ret.err)
        ? 'err(e) => { return err(e); }' : 'err(e) => { /* handle e */ }';
      const newText = `match ${this.txt(e.loc)} {\n${ind}  ok(v) => {},\n${ind}  ${errArm},\n${ind}}`;
      this.err('TN1002', 'Result value is not handled.', e.loc, {
        expected: 'a match with ok and err arms (or bind/return the Result)', actual: tyStr(t),
        fix: { description: 'Handle both the ok and err cases with match', edit: { loc: stmtLoc, newText } },
      });
    }
  }

  // ---- if / match
  checkIf(e: IfExpr, scope: Scope, value: boolean): Ty {
    const ct = this.checkExpr(e.cond, scope);
    this.reportAssign(ct, T.boolean, e.cond);
    const n = narrowings(e.cond);
    if (value) this.valueDepth++;
    const thenTy = this.checkBlock(e.then, scope, value, n.t);
    let elseTy: Ty = T.void;
    if (e.else) {
      if (e.else.kind === 'If') {
        const s2 = new Scope(scope);
        for (const x of n.f) this.narrow(s2, x);
        elseTy = this.checkIf(e.else, s2, value);
      } else elseTy = this.checkBlock(e.else, scope, value, n.f);
    }
    if (value) this.valueDepth--;
    if (!value) return T.void;
    if (!e.else) {
      this.err('TN0008', "An 'if' used as a value needs an 'else' branch.", e.loc, { expected: 'else branch', actual: 'none' });
      return T.unknown;
    }
    const u = unify(thenTy, elseTy);
    if (!u) {
      const at = e.else.kind === 'If' ? e.else.loc : (e.else.tail?.loc ?? e.else.loc);
      this.err('TN0002', `Type '${tyStr(elseTy)}' is not assignable to type '${tyStr(thenTy)}'.`, at, {
        expected: tyStr(thenTy), actual: tyStr(elseTy), fix: { description: 'Make both branches produce the same type' },
      });
      return thenTy;
    }
    return u;
  }

  checkMatch(e: MatchExpr, scope: Scope, value: boolean): Ty {
    const st = this.checkExpr(e.scrut, scope);
    let okTy: Ty = T.unknown, errTy: Ty = T.unknown;
    let exhaustive = true;
    if (st.k === 'result') { okTy = st.ok; errTy = st.err; }
    else if (st.k !== 'unknown') {
      exhaustive = false;
      this.err('TN2004', 'match requires a Result value.', e.scrut.loc, {
        expected: 'Result<T, E>', actual: tyStr(st),
        fix: { description: 'Match only on values of type Result<T, E>; use if/else for other types' },
      });
    }
    const seen: string[] = [];
    const armTys: Ty[] = [];
    let acc: Ty | null = null;
    for (const arm of e.arms) {
      let eff = arm.pat;
      if (arm.pat !== 'ok' && arm.pat !== 'err') {
        const lower = arm.pat.toLowerCase();
        const fixable = lower === 'ok' || lower === 'err';
        this.err('TN2003', `Unknown pattern '${arm.pat}'; expected 'ok' or 'err'.`, arm.patLoc, {
          expected: "'ok' or 'err'", actual: `'${arm.pat}'`,
          fix: fixable
            ? { description: `Use lowercase '${lower}'`, edit: { loc: arm.patLoc, newText: lower } }
            : { description: "Use 'ok(value)' and 'err(error)' patterns" },
        });
        eff = fixable ? lower : '?';
      } else if (seen.includes(arm.pat)) {
        this.err('TN2002', `Duplicate '${arm.pat}' arm.`, arm.patLoc, { expected: 'each of ok/err once', actual: `second '${arm.pat}' arm`, fix: { description: 'Remove the duplicate arm' } });
      }
      if (eff !== '?') seen.push(eff);
      const bind = new Var(arm.bind, eff === 'ok' ? okTy : eff === 'err' ? errTy : T.unknown, arm.bindLoc, false);
      if (value) this.valueDepth++;
      const ty = this.checkBlock(arm.body, scope, value, [], [bind]);
      if (value) this.valueDepth--;
      armTys.push(ty);
      if (value) {
        if (acc === null) acc = ty;
        else {
          const u = unify(acc, ty);
          if (u) acc = u;
          else {
            this.err('TN0002', `Type '${tyStr(ty)}' is not assignable to type '${tyStr(acc)}'.`, arm.body.tail?.loc ?? arm.body.loc, {
              expected: tyStr(acc), actual: tyStr(ty), fix: { description: 'Make all match arms produce the same type' },
            });
          }
        }
      }
    }
    if (exhaustive) {
      for (const m of ['ok', 'err'] as const) {
        if (seen.includes(m)) continue;
        const stub = this.armStub(m, value, st, armTys);
        const ind = this.indent(e.closeLoc.startLine);
        this.err('TN2001', `match is not exhaustive: missing '${m}' case.`, e.headLoc, {
          expected: 'arms: ok, err', actual: `arms: ${seen.join(', ') || '(none)'}`,
          fix: stub
            ? { description: `Add the missing '${m}' arm`, edit: { loc: this.zeroAt(e.closeLoc), newText: `  ${stub},\n${ind}` } }
            : { description: `Add an '${m}(${m === 'ok' ? 'value' : 'error'}) => ...' arm` },
        });
      }
    }
    return value ? (acc ?? T.unknown) : T.void;
  }

  armStub(missing: 'ok' | 'err', value: boolean, st: Ty, armTys: Ty[]): string | null {
    const ret = this.cur.ret;
    const stmtStub = missing === 'ok' ? 'ok(v) => {}' : null;
    if (!value) {
      if (missing === 'ok') return stmtStub;
      return ret?.k === 'result' && st.k === 'result' && isComplete(st.err) && assignable(st.err, ret.err)
        ? 'err(e) => { return err(e); }' : 'err(e) => { /* handle e */ }';
    }
    if (ret?.k === 'result' && st.k === 'result' && armTys.some((t) => t.k === 'result')) {
      if (missing === 'err' && isComplete(st.err) && assignable(st.err, ret.err)) return 'err(e) => err(e)';
      if (missing === 'ok' && isComplete(st.ok) && assignable(st.ok, ret.ok)) return 'ok(v) => ok(v)';
    }
    return null;
  }

  // ---- expressions
  reportAssign(actual: Ty, expected: Ty, e: Expr): void {
    if (assignable(actual, expected)) return;
    const text = this.txt(e.loc);
    const A = tyStr(actual), E = tyStr(expected);
    if (actual.k === 'result' && expected.k !== 'result') {
      this.err('TN1003', `Type '${A}' is not assignable to type '${E}'; a Result must be matched before its value is used.`, e.loc, {
        expected: E, actual: A,
        fix: { description: `Handle it: match ${text} { ok(v) => <use v>, err(e) => <handle e> }` },
      });
    } else if (actual.k === 'nullable' && assignable(actual.inner, expected)) {
      this.err('TN3002', `Type '${A}' is not assignable to type '${E}'; the value may be null.`, e.loc, {
        expected: E, actual: A,
        fix: expected.k === 'boolean' && actual.inner.k !== 'boolean'
          ? { description: `Compare explicitly: ${text} !== null`, edit: { loc: e.loc, newText: `${text} !== null` } }
          : { description: `Check for null first: if (${text} !== null) { ... } (or compare with === null and return early)` },
      });
    } else {
      this.err('TN0002', `Type '${A}' is not assignable to type '${E}'.`, e.loc, { expected: E, actual: A });
    }
  }

  checkExpr(e: Expr, scope: Scope): Ty {
    switch (e.kind) {
      case 'Num': return T.number;
      case 'Str': return T.string;
      case 'Bool': return T.boolean;
      case 'Null': return T.null;
      case 'Undef':
        this.err('TN3002', "'undefined' is not allowed; use 'null' for absent values.", e.loc, {
          expected: 'null', actual: 'undefined',
          fix: { description: "Replace 'undefined' with 'null'", edit: { loc: e.loc, newText: 'null' } },
        });
        return T.null;
      case 'Ident': {
        const v = scope.lookup(e.name);
        if (v) { markUsed(v); return v.ty; }
        if (this.fns.has(e.name) || PRELUDE[e.name]) {
          this.err('TN0004', `'${e.name}' is a function and cannot be used as a value.`, e.loc, { fix: { description: `Call it: ${e.name}(...)` } });
          return T.unknown;
        }
        const s = nearest(e.name, scope.names());
        this.err('TN0004', `Cannot find name '${e.name}'.`, e.loc, {
          actual: e.name,
          fix: s ? { description: `Did you mean '${s}'?`, edit: { loc: e.loc, newText: s } } : { description: 'Declare it with let, or pass it as a parameter' },
        });
        return T.unknown;
      }
      case 'Unary': {
        const t = this.checkExpr(e.expr, scope);
        const want = e.op === '!' ? T.boolean : T.number;
        this.reportAssign(t, want, e.expr);
        return want;
      }
      case 'Binary': return this.checkBinary(e, scope);
      case 'Call': return this.checkCall(e, scope);
      case 'If': return this.checkIf(e, scope, true);
      case 'Match': return this.checkMatch(e, scope, true);
    }
  }

  checkBinary(e: Extract<Expr, { kind: 'Binary' }>, scope: Scope): Ty {
    const op = e.op;
    if (op === '&&' || op === '||') {
      const lt = this.checkExpr(e.left, scope);
      this.reportAssign(lt, T.boolean, e.left);
      const n = narrowings(e.left);
      const s2 = new Scope(scope);
      for (const x of op === '&&' ? n.t : n.f) this.narrow(s2, x);
      const rt = this.checkExpr(e.right, s2);
      this.reportAssign(rt, T.boolean, e.right);
      return T.boolean;
    }
    const lt = this.checkExpr(e.left, scope);
    const rt = this.checkExpr(e.right, scope);
    if (['==', '!=', '===', '!=='].includes(op)) {
      if (lt.k === 'null' || rt.k === 'null' || assignable(lt, rt) || assignable(rt, lt)) return T.boolean;
      this.err('TN0002', `This comparison is always false: types '${tyStr(lt)}' and '${tyStr(rt)}' have no overlap.`, e.loc, {
        expected: tyStr(lt), actual: tyStr(rt),
      });
      return T.boolean;
    }
    const isCmp = ['<', '>', '<=', '>='].includes(op);
    const str = op === '+' || isCmp ? lt.k === 'string' || rt.k === 'string' : false;
    const operand = str ? T.string : T.number;
    this.reportAssign(lt, operand, e.left);
    this.reportAssign(rt, operand, e.right);
    return isCmp ? T.boolean : operand;
  }

  checkCall(e: Extract<Expr, { kind: 'Call' }>, scope: Scope): Ty {
    if (e.name === 'ok' || e.name === 'err') {
      if (e.args.length !== 1) {
        this.err('TN0005', `Expected 1 argument, but got ${e.args.length}.`, e.loc, { expected: `${e.name}(value)`, actual: `${e.args.length} arguments` });
        e.args.forEach((a) => this.checkExpr(a, scope));
        return T.unknown;
      }
      const t = this.checkExpr(e.args[0], scope);
      return e.name === 'ok' ? T.result(t, T.unknown) : T.result(T.unknown, t);
    }
    const sig: Sig | undefined = this.fns.get(e.name) ?? (PRELUDE[e.name] && { params: PRELUDE[e.name].params, ret: PRELUDE[e.name].ret });
    const argTys = e.args.map((a) => this.checkExpr(a, scope));
    if (!sig) {
      const s = nearest(e.name, [...this.fns.keys(), ...Object.keys(PRELUDE), 'ok', 'err']);
      this.err('TN0004', `Cannot find name '${e.name}'.`, e.nameLoc, {
        actual: e.name,
        fix: s ? { description: `Did you mean '${s}'?`, edit: { loc: e.nameLoc, newText: s } } : { description: 'Define the function, or use one of the builtins' },
      });
      return T.unknown;
    }
    const sigStr = `${e.name}(${sig.params.map(tyStr).join(', ')})`;
    if (e.args.length !== sig.params.length) {
      this.err('TN0005', `Expected ${sig.params.length} argument${sig.params.length === 1 ? '' : 's'}, but got ${e.args.length}.`, e.loc, {
        expected: sigStr, actual: `${e.name}(${argTys.map(tyStr).join(', ')})`,
      });
    }
    for (let i = 0; i < Math.min(e.args.length, sig.params.length); i++) this.reportAssign(argTys[i], sig.params[i], e.args[i]);
    return sig.ret ?? T.unknown;
  }
}

export function check(program: Program, file: string, src: string): Diagnostic[] {
  return new Checker(src, file).run(program);
}
