// This file is the rule-checker, the "teacher" that reads a program and marks mistakes.
// It makes sure the program follows Tensium's rules: failures are returned as values
// instead of thrown, every Result is opened with both an ok and an err case, every match on an
// enum covers every member, nothing that might be empty (null) gets used before it is checked,
// a newtype like Cents is never mixed up with a plain number, and only bindings marked 'mut'
// can change. It also guards the line between client and server: both sides must agree on
// every record field, and secrets must stay on the server. Each mistake becomes a diagnostic
// with the exact spot, what was expected, what was found, and a suggested fix.

import { Block, EnumDecl, Expr, Fn, IfExpr, MatchExpr, NewtypeDecl, Program, RecordExpr, Side, Stmt, TypeDecl, TypeNode } from './ast.ts';
import { Diagnostic, FixSpec, Loc, mkDiag } from './diagnostics.ts';
import { PRELUDE } from './prelude.ts';
import { T, Ty, assignable, containsSecret, isComplete, tyStr, unify } from './types.ts';

class Var {
  used = false;
  constructor(public name: string, public ty: Ty, public loc: Loc, public isLet: boolean, public orig?: Var, public mut = false) {}
}

class Scope {
  vars = new Map<string, Var>();
  /** Field paths such as "c.email" that a null check has proven non-null in this scope. */
  narrowedPaths = new Set<string>();
  constructor(public parent?: Scope) {}
  lookup(name: string): Var | undefined {
    return this.vars.get(name) ?? this.parent?.lookup(name);
  }
  /** Bindings and records never change, so a checked field stays non-null until its root name is rebound. */
  pathNarrowed(path: string): boolean {
    if (this.narrowedPaths.has(path)) return true;
    const root = this.vars.get(path.split('.')[0]);
    if (root && !root.orig) return false; // a different variable with the same name starts here
    return this.parent?.pathNarrowed(path) ?? false;
  }
  names(): string[] {
    return [...this.vars.keys(), ...(this.parent?.names() ?? [])];
  }
}

const markUsed = (v: Var): void => { v.used = true; if (v.orig) markUsed(v.orig); };

interface Sig { params: Ty[]; ret: Ty | null; side: Side; fn?: Fn }
interface FnCtx { ret: Ty | null; retTys: Ty[] }
interface DeclInfo { decl: TypeDecl; ty?: Ty; resolving?: boolean }
type RecordTy = Extract<Ty, { k: 'record' }>;
type EnumTy = Extract<Ty, { k: 'enum' }>;
type NewtypeTy = Extract<Ty, { k: 'newtype' }>;

export interface CheckResult {
  diagnostics: Diagnostic[];
  /** Names of the server fns that client code calls: the only ones exposed over the network. */
  boundary: string[];
}

const BUILTIN_TYPES = ['number', 'string', 'boolean', 'void', 'null', 'any', 'undefined', 'Result', 'List', 'Secret'];

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // two neighbouring letters swapped ("nmae" for "name") counts as one slip, not two
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

const nearest = (name: string, cands: string[]): string | undefined => {
  let best: string | undefined, bd = Infinity;
  for (const c of cands) { const d = lev(name, c); if (d < bd) { bd = d; best = c; } }
  return best !== undefined && bd <= Math.max(1, Math.floor(name.length / 3)) ? best : undefined;
};

/** For a renamed field: the closest spelling, or else the only candidate that contains (or is contained in) the old name. */
const nearestField = (name: string, cands: string[]): string | undefined => {
  const close = nearest(name, cands);
  if (close) return close;
  const n = name.toLowerCase();
  const related = cands.filter((c) => c.toLowerCase().includes(n) || n.includes(c.toLowerCase()));
  return related.length === 1 ? related[0] : undefined;
};

type Narrow = { t: string[]; f: string[] };

/** `x` or `x.a.b`: the things a null check can vouch for. */
function pathOf(e: Expr): string | null {
  if (e.kind === 'Ident') return e.name;
  if (e.kind !== 'Field') return null;
  const base = pathOf(e.obj);
  return base === null ? null : `${base}.${e.name}`;
}

function narrowings(e: Expr): Narrow {
  const none: Narrow = { t: [], f: [] };
  if (e.kind === 'Unary' && e.op === '!') { const n = narrowings(e.expr); return { t: n.f, f: n.t }; }
  if (e.kind !== 'Binary') return none;
  if (e.op === '&&') return { t: [...narrowings(e.left).t, ...narrowings(e.right).t], f: [] };
  if (e.op === '||') return { t: [], f: [...narrowings(e.left).f, ...narrowings(e.right).f] };
  if (['!==', '!=', '===', '=='].includes(e.op)) {
    const path = e.right.kind === 'Null' ? pathOf(e.left) : e.left.kind === 'Null' ? pathOf(e.right) : null;
    if (path === null) return none;
    return e.op.startsWith('!') ? { t: [path], f: [] } : { t: [], f: [path] };
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

/** The TypeScript spelling of the plain type inside a newtype (only number, string and boolean are allowed there). */
const innerTs = (t: Ty): string => (t.k === 'number' || t.k === 'string' || t.k === 'boolean' ? t.k : 'unknown');

class Checker {
  diags: Diagnostic[] = [];
  fns = new Map<string, Sig>();
  fnNodes = new Map<Fn, Sig>();
  types = new Map<string, DeclInfo>();
  enums = new Map<string, EnumTy>();
  newtypes = new Map<string, NewtypeTy>();
  cur: FnCtx = { ret: null, retTys: [] };
  curSide: Side = 'shared';
  curFn: Fn | undefined;
  /** Server fns called from client code, with the first place each is called. */
  boundary = new Map<string, Loc>();
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
  typeNames(): string[] { return [...this.types.keys(), ...this.enums.keys(), ...this.newtypes.keys()]; }

  // ---- types
  resolveType(n: TypeNode): Ty {
    switch (n.kind) {
      case 'TypeResult': return T.result(this.resolveType(n.ok), this.resolveType(n.err));
      case 'TypeList': return T.list(this.resolveType(n.elem));
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
          case 'List':
            this.err('TN0011', "List requires a type argument: List<T>.", n.loc, { expected: 'List<T>', actual: 'List' });
            return T.unknown;
          case 'Secret':
            this.secretOutsideServer('Secret', n.loc);
            return T.secret;
          default: {
            const en = this.enums.get(n.name);
            if (en) return en;
            const nt = this.newtypes.get(n.name);
            if (nt) return nt;
            const d = this.types.get(n.name);
            if (d) {
              const t = this.resolveDecl(d);
              if (containsSecret(t)) this.secretOutsideServer(n.name, n.loc);
              return t;
            }
            const known = ['number', 'string', 'boolean', 'void', 'Result', 'List', ...this.typeNames()];
            const s = nearest(n.name, known);
            this.err('TN0004', `Cannot find type '${n.name}'.`, n.loc, {
              expected: [...known.slice(0, 4), 'null', 'Result<T, E>', 'List<T>', ...this.typeNames()].join(' | '), actual: n.name,
              fix: s ? { description: `Did you mean '${s}'?`, edit: { loc: n.loc, newText: s } } : { description: "Use a builtin type, or declare one: type Name = { field: type, ... }" },
            });
            return T.unknown;
          }
        }
    }
  }

  secretOutsideServer(typeName: string, loc: Loc): void {
    if (this.curSide === 'server') return;
    this.err('TN5001', typeName === 'Secret'
      ? "The 'Secret' type can only be used in a server fn; secrets never reach the client."
      : `Type '${typeName}' holds a Secret, so it can only be used in a server fn.`, loc, {
      expected: 'no secrets outside server code', actual: `${typeName} in a ${this.curSide} fn`,
      fix: { description: "Keep the secret inside a 'server fn' and give the client only what it needs" },
    });
  }

  resolveDecl(d: DeclInfo): Ty {
    if (d.ty) return d.ty;
    if (d.resolving) {
      this.err('TN0011', `Type '${d.decl.name}' refers to itself; recursive types are not supported.`, d.decl.nameLoc, {
        expected: 'a type made of other, already complete types', actual: 'a type that contains itself',
      });
      return T.unknown;
    }
    d.resolving = true;
    const fields: [string, Ty][] = [];
    for (const f of d.decl.fields) {
      if (fields.some(([n]) => n === f.name)) {
        this.err('TN0007', `Duplicate field '${f.name}' in type '${d.decl.name}'.`, f.nameLoc, { fix: { description: 'Remove or rename the duplicate field' } });
        continue;
      }
      fields.push([f.name, this.resolveType(f.typeNode)]);
    }
    d.resolving = false;
    d.ty = { k: 'record', name: d.decl.name, fields };
    return d.ty;
  }

  /** Records, enums and newtypes share one namespace; each name is declared once. */
  declareName(name: string, nameLoc: Loc): boolean {
    if (BUILTIN_TYPES.includes(name) || this.types.has(name) || this.enums.has(name) || this.newtypes.has(name)) {
      this.err('TN0007', BUILTIN_TYPES.includes(name) ? `'${name}' is a builtin type and cannot be redefined.` : `Duplicate type '${name}'.`, nameLoc, {
        fix: { description: 'Rename the type' },
      });
      return false;
    }
    return true;
  }

  declareEnum(d: EnumDecl): void {
    if (!this.declareName(d.name, d.nameLoc)) return;
    const members: string[] = [];
    for (const m of d.members) {
      if (members.includes(m.name)) {
        this.err('TN0007', `Duplicate member '${m.name}' in enum '${d.name}'.`, m.loc, { fix: { description: 'Remove or rename the duplicate member' } });
        continue;
      }
      members.push(m.name);
    }
    if (members.length === 0) this.err('TN0011', `Enum '${d.name}' has no members.`, d.nameLoc, { expected: 'at least one member', actual: 'none' });
    this.enums.set(d.name, { k: 'enum', name: d.name, members });
  }

  declareNewtype(d: NewtypeDecl): void {
    if (!this.declareName(d.name, d.nameLoc)) return;
    const inner = this.resolveType(d.typeNode);
    if (inner.k !== 'number' && inner.k !== 'string' && inner.k !== 'boolean' && inner.k !== 'unknown') {
      this.err('TN0011', `A newtype wraps a plain number, string or boolean, not '${tyStr(inner)}'.`, d.typeNode.loc, {
        expected: 'number, string or boolean', actual: tyStr(inner),
        fix: { description: 'Use a record type (type Name = { ... }) for anything more than one plain value' },
      });
    }
    this.newtypes.set(d.name, { k: 'newtype', name: d.name, inner });
  }

  // ---- program
  run(p: Program): CheckResult {
    this.curSide = 'server';
    for (const d of p.enums) this.declareEnum(d);
    for (const d of p.newtypes) this.declareNewtype(d);
    for (const d of p.types) {
      if (!this.declareName(d.name, d.nameLoc)) continue;
      this.types.set(d.name, { decl: d });
    }
    // A record type may hold a Secret; whether it is allowed is decided at each place the type is used.
    for (const d of this.types.values()) this.resolveDecl(d);
    for (const fn of p.fns) {
      this.curSide = fn.side;
      const taken = PRELUDE[fn.name] || fn.name === 'ok' || fn.name === 'err';
      const isType = this.enums.has(fn.name) || this.newtypes.has(fn.name) || this.types.has(fn.name);
      if (taken || isType || this.fns.has(fn.name)) {
        this.err('TN0007', taken ? `'${fn.name}' is a builtin and cannot be redefined.`
          : isType ? `'${fn.name}' is already the name of a type.` : `Duplicate function '${fn.name}'.`, fn.nameLoc, {
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
      const sig: Sig = { params, ret, side: fn.side, fn };
      this.fnNodes.set(fn, sig);
      if (!this.fns.has(fn.name) && !taken && !isType) this.fns.set(fn.name, sig);
    }
    for (const fn of p.fns) this.checkFn(fn);
    this.checkBoundary();
    return { diagnostics: this.diags, boundary: [...this.boundary.keys()] };
  }

  /** Every server fn that client code calls is reachable over the network, so its signature has extra rules. */
  checkBoundary(): void {
    for (const name of this.boundary.keys()) {
      const sig = this.fns.get(name)!;
      const fn = sig.fn!;
      fn.params.forEach((pa, i) => {
        if (pa.typeNode && containsSecret(sig.params[i])) {
          this.err('TN5002', `Parameter '${pa.name}' of server fn '${name}' carries a Secret, but '${name}' is called from client code.`, pa.typeNode.loc, {
            expected: 'no Secret in anything that crosses between client and server', actual: tyStr(sig.params[i]),
            fix: { description: 'Read the secret inside the server fn with secret("NAME") instead of taking it as a parameter' },
          });
        }
      });
      const ret = sig.ret;
      if (!ret || !fn.retNode || ret.k === 'unknown') continue;
      if (containsSecret(ret)) {
        this.err('TN5002', `Server fn '${name}' is called from client code, so it cannot return a Secret.`, fn.retNode.loc, {
          expected: 'no Secret in anything that crosses between client and server', actual: tyStr(ret),
          fix: { description: 'Return only the non-secret data the client needs' },
        });
      }
      if (ret.k !== 'result') {
        this.err('TN5006', `Server fn '${name}' is called from client code, so it must return Result<T, string>: a network call can fail.`, fn.retNode.loc, {
          expected: `Result<${tyStr(ret)}, string>`, actual: tyStr(ret),
          fix: { description: 'Wrap the return type in Result<..., string> and return ok(...) values', edit: { loc: fn.retNode.loc, newText: `Result<${this.txt(fn.retNode.loc)}, string>` } },
        });
      } else if (ret.err.k !== 'string' && ret.err.k !== 'unknown') {
        const at = fn.retNode.kind === 'TypeResult' ? fn.retNode.err.loc : fn.retNode.loc;
        this.err('TN5006', `Server fn '${name}' is called from client code, so its error type must be string: a network failure arrives as err("network: ...").`, at, {
          expected: `Result<${tyStr(ret.ok)}, string>`, actual: tyStr(ret),
          fix: { description: "Use 'string' as the error type" },
        });
      }
    }
  }

  checkFn(fn: Fn): void {
    const sig = this.fnNodes.get(fn)!;
    this.curSide = fn.side;
    this.curFn = fn;
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
    if (name.includes('.')) { scope.narrowedPaths.add(name); return; }
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
            const hint = ty.k === 'list' ? `List<number>` : 'Result<number, string>';
            this.err('TN3001', `Variable '${s.name}' implicitly has type '${tyStr(ty)}' that cannot be fully inferred.`, s.nameLoc, {
              expected: 'type annotation', actual: tyStr(ty),
              fix: { description: `Annotate the binding, e.g. 'let ${s.mut ? 'mut ' : ''}${s.name}: ${hint} = ...'` },
            });
            ty = T.unknown;
          }
        }
        const prev = scope.vars.get(s.name);
        if (prev && !prev.orig) this.err('TN0007', `Duplicate binding '${s.name}' in the same scope.`, s.nameLoc, { fix: { description: 'Rename the binding' } });
        scope.vars.set(s.name, new Var(s.name, ty, s.nameLoc, true, undefined, s.mut));
        return;
      }
      case 'Assign': {
        const t = this.checkExpr(s.expr, scope);
        const v = scope.lookup(s.name);
        if (!v) {
          const near = nearest(s.name, scope.names());
          this.err('TN0004', `Cannot find name '${s.name}'.`, s.nameLoc, {
            actual: s.name,
            fix: near ? { description: `Did you mean '${near}'?`, edit: { loc: s.nameLoc, newText: near } } : { description: `Declare it first: let mut ${s.name} = ...;` },
          });
          return;
        }
        const root = v.orig ?? v;
        if (!root.mut) {
          const declLoc = root.loc;
          this.err('TN0012', `Cannot assign to '${s.name}': it was not declared with 'let mut'.`, s.nameLoc, {
            expected: `a binding declared 'let mut ${s.name} = ...'`, actual: root.isLet ? `'${s.name}' declared with 'let'` : `parameter '${s.name}'`,
            fix: root.isLet
              ? { description: `Declare it as 'let mut ${s.name}'`, edit: { loc: this.zeroAt(declLoc), newText: 'mut ' } }
              : { description: `Copy it into a mutable binding first: let mut ${s.name}2 = ${s.name};` },
          });
        }
        this.reportAssign(t, root.ty, s.expr);
        markUsed(v);
        // the new value may be null again, so any narrowing of this name is gone
        if (v.orig) scope.vars.set(s.name, root);
        return;
      }
      case 'For': {
        const it = this.checkExpr(s.iter, scope);
        let elem: Ty = T.unknown;
        if (it.k === 'list') elem = it.elem;
        else if (it.k !== 'unknown') {
          this.err('TN0002', `Can only loop over a List; '${this.txt(s.iter.loc)}' is ${tyStr(it)}.`, s.iter.loc, {
            expected: 'List<T>', actual: tyStr(it),
            fix: { description: it.k === 'number' ? 'Loop over range(0, n) to count' : 'Loop over a list value' },
          });
        }
        if (scope.lookup(s.name)) this.err('TN0007', `Duplicate binding '${s.name}'.`, s.nameLoc, { fix: { description: 'Rename the loop variable' } });
        this.checkBlock(s.body, scope, false, [], [new Var(s.name, elem, s.nameLoc, false)]);
        return;
      }
      case 'While': {
        const ct = this.checkExpr(s.cond, scope);
        this.reportAssign(ct, T.boolean, s.cond);
        this.checkBlock(s.body, scope, false, narrowings(s.cond).t);
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
    } else if (e.kind === 'Call' && t.k === 'list' && (e.name === 'push' || e.name === 'concat')) {
      this.err('TN1002', `'${e.name}' gives back a new list; the old one does not change, so this call does nothing.`, e.loc, {
        expected: `let mut xs = ...; xs = ${e.name}(xs, ...);`, actual: `unused ${tyStr(t)}`,
        fix: { description: `Keep the result: ${this.txt(e.args[0]?.loc ?? e.loc)} = ${this.txt(e.loc)};` },
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
    if (st.k === 'enum') return this.checkEnumMatch(e, st, scope, value);
    let okTy: Ty = T.unknown, errTy: Ty = T.unknown;
    let exhaustive = true;
    if (st.k === 'result') { okTy = st.ok; errTy = st.err; }
    else if (st.k !== 'unknown') {
      exhaustive = false;
      this.err('TN2004', 'match requires a Result or an enum value.', e.scrut.loc, {
        expected: 'Result<T, E> or an enum', actual: tyStr(st),
        fix: { description: 'Match only on a Result<T, E> or an enum value; use if/else for other types' },
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
      if (arm.bind === undefined) {
        const name = eff === 'err' ? 'e' : 'v';
        this.err('TN2003', `'${arm.pat}' needs a name for its value: ${arm.pat}(${name}).`, arm.patLoc, {
          expected: `${arm.pat}(${name}) => ...`, actual: `${arm.pat} => ...`,
          fix: { description: `Write ${arm.pat}(${name})`, edit: { loc: arm.patLoc, newText: `${arm.pat}(${name})` } },
        });
      }
      const bind = new Var(arm.bind ?? '_', eff === 'ok' ? okTy : eff === 'err' ? errTy : T.unknown, arm.bindLoc ?? arm.patLoc, false);
      if (value) this.valueDepth++;
      const ty = this.checkBlock(arm.body, scope, value, [], [bind]);
      if (value) this.valueDepth--;
      armTys.push(ty);
      if (value) acc = this.joinArm(acc, ty, arm);
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

  /** `match status { Draft => ..., Sent => ..., ... }`: every member once, no bindings. */
  checkEnumMatch(e: MatchExpr, st: EnumTy, scope: Scope, value: boolean): Ty {
    const seen: string[] = [];
    let acc: Ty | null = null;
    for (const arm of e.arms) {
      if (!st.members.includes(arm.pat)) {
        const guess = nearest(arm.pat, st.members);
        this.err('TN2003', `'${arm.pat}' is not a member of enum '${st.name}'.`, arm.patLoc, {
          expected: `one of: ${st.members.join(', ')}`, actual: `'${arm.pat}'`,
          fix: guess ? { description: `Did you mean '${guess}'?`, edit: { loc: arm.patLoc, newText: guess } } : { description: `Use one of the members of ${st.name}` },
        });
      } else if (seen.includes(arm.pat)) {
        this.err('TN2002', `Duplicate '${arm.pat}' arm.`, arm.patLoc, { expected: 'each member once', actual: `second '${arm.pat}' arm`, fix: { description: 'Remove the duplicate arm' } });
      } else seen.push(arm.pat);
      if (arm.bind !== undefined && arm.bindLoc) {
        this.err('TN2003', `Enum members carry no value, so '${arm.pat}' takes no binding.`, arm.bindLoc, {
          expected: `${arm.pat} => ...`, actual: `${arm.pat}(${arm.bind}) => ...`,
          fix: { description: `Write '${arm.pat} =>'`, edit: { loc: { ...arm.patLoc, endLine: arm.bindLoc.endLine, endCol: arm.bindLoc.endCol + 1, eo: arm.bindLoc.eo + 1 }, newText: arm.pat } },
        });
      }
      if (value) this.valueDepth++;
      const ty = this.checkBlock(arm.body, scope, value);
      if (value) this.valueDepth--;
      if (value) acc = this.joinArm(acc, ty, arm);
    }
    const missing = st.members.filter((m) => !seen.includes(m));
    if (missing.length) {
      const ind = this.indent(e.closeLoc.startLine);
      this.err('TN2001', `match is not exhaustive: missing ${missing.map((m) => `'${m}'`).join(', ')}.`, e.headLoc, {
        expected: `arms: ${st.members.join(', ')}`, actual: `arms: ${seen.join(', ') || '(none)'}`,
        fix: value
          ? { description: `Add an arm for each of: ${missing.join(', ')}` }
          : { description: `Add the missing arm${missing.length === 1 ? '' : 's'}`, edit: { loc: this.zeroAt(e.closeLoc), newText: missing.map((m) => `  ${m} => {},\n${ind}`).join('') } },
      });
    }
    return value ? (acc ?? T.unknown) : T.void;
  }

  joinArm(acc: Ty | null, ty: Ty, arm: MatchExpr['arms'][number]): Ty {
    if (acc === null) return ty;
    const u = unify(acc, ty);
    if (u) return u;
    this.err('TN0002', `Type '${tyStr(ty)}' is not assignable to type '${tyStr(acc)}'.`, arm.body.tail?.loc ?? arm.body.loc, {
      expected: tyStr(acc), actual: tyStr(ty), fix: { description: 'Make all match arms produce the same type' },
    });
    return acc;
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
    // Report as close to the real mistake as possible: look inside ok(...)/err(...) and record values.
    if (e.kind === 'Call' && (e.name === 'ok' || e.name === 'err') && e.args.length === 1 && actual.k === 'result' && expected.k === 'result') {
      const [a, x] = e.name === 'ok' ? [actual.ok, expected.ok] : [actual.err, expected.err];
      if (!assignable(a, x)) { this.reportAssign(a, x, e.args[0]); return; }
    }
    const want = expected.k === 'nullable' ? expected.inner : expected;
    if (actual.k === 'record' && want.k === 'record') { this.reportRecord(actual, want, e); return; }
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
          : pathOf(e) !== null
            ? { description: `Check for null first: if (${text} !== null) { ... } (or compare with === null and return early)` }
            : { description: `Give the value a name, then check it: let value = ${text}; if (value !== null) { ... }` },
      });
    } else if (actual.k === 'newtype' && assignable(actual.inner, want)) {
      this.err('TN0002', `Type '${A}' is not assignable to type '${E}'; ${A} wraps a ${tyStr(actual.inner)}, and the two are kept apart on purpose.`, e.loc, {
        expected: E, actual: A,
        fix: { description: `Read the plain ${tyStr(actual.inner)} with .value`, edit: { loc: e.loc, newText: `${text}.value` } },
      });
    } else if (want.k === 'newtype' && actual.k !== 'newtype' && assignable(actual, want.inner)) {
      this.err('TN0002', `Type '${A}' is not assignable to type '${E}'; a plain ${A} must be wrapped as ${want.name}(...).`, e.loc, {
        expected: E, actual: A,
        fix: { description: `Wrap it: ${want.name}(${text})`, edit: { loc: e.loc, newText: `${want.name}(${text})` } },
      });
    } else if (want.k === 'newtype' && actual.k === 'newtype') {
      this.err('TN0002', `Type '${A}' is not assignable to type '${E}'; these are different newtypes and cannot be mixed up.`, e.loc, {
        expected: E, actual: A, fix: { description: `Pass a ${want.name}, not a ${A}` },
      });
    } else if (expected.k === 'result' && actual.k !== 'result' && actual.k !== 'unknown' && assignable(actual, expected.ok)) {
      this.err('TN0002', `Type '${A}' is not assignable to type '${E}'; a success value must be wrapped in ok(...).`, e.loc, {
        expected: E, actual: A,
        fix: { description: 'Wrap the value in ok(...)', edit: { loc: e.loc, newText: `ok(${text})` } },
      });
    } else {
      this.err('TN0002', `Type '${A}' is not assignable to type '${E}'.`, e.loc, { expected: E, actual: A });
    }
  }

  /** A record value that does not fit a record type: say exactly which fields are wrong. */
  reportRecord(actual: RecordTy, expected: RecordTy, e: Expr): void {
    const E = tyStr(expected);
    const act = new Map(actual.fields), exp = new Map(expected.fields);
    const missing = expected.fields.map(([n]) => n).filter((n) => !act.has(n));
    const extra = actual.fields.map(([n]) => n).filter((n) => !exp.has(n));
    const shape = `{ ${expected.fields.map(([n, t]) => `${n}: ${tyStr(t)}`).join(', ')} }`;
    if (e.kind !== 'Record') {
      this.err(missing.length || extra.length ? 'TN5005' : 'TN0002', `Type '${tyStr(actual)}' is not assignable to type '${E}'.`, e.loc, {
        expected: shape,
        actual: [missing.length ? `missing: ${missing.join(', ')}` : '', extra.length ? `not in ${E}: ${extra.join(', ')}` : ''].filter(Boolean).join('; ') || tyStr(actual),
      });
      return;
    }
    const unclaimed = [...missing];
    for (const name of extra) {
      const f = e.fields.find((x) => x.name === name)!;
      const guess = nearestField(name, unclaimed);
      if (guess) unclaimed.splice(unclaimed.indexOf(guess), 1);
      // `{ name }` shorthand has to become `{ fullName: name }`, not just a renamed word
      const shorthand = f.value.kind === 'Ident' && f.value.loc.so === f.nameLoc.so;
      this.err('TN5005', `'${name}' is not a field of type '${E}'.`, f.nameLoc, {
        expected: shape, actual: name,
        fix: guess
          ? { description: `Did you mean '${guess}'?`, edit: { loc: f.nameLoc, newText: shorthand ? `${guess}: ${name}` : guess } }
          : { description: `Remove '${name}', or add it to type ${E}` },
      });
    }
    for (const name of unclaimed) {
      this.err('TN5005', `Field '${name}' is missing in this ${E} value.`, e.loc, {
        expected: `${name}: ${tyStr(exp.get(name)!)}`, actual: 'missing',
        fix: { description: `Add '${name}: <${tyStr(exp.get(name)!)}>' to the record` },
      });
    }
    for (const f of e.fields) {
      const a = act.get(f.name), x = exp.get(f.name);
      if (a && x) this.reportAssign(a, x, f.value);
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
        const en = this.enums.get(e.name);
        if (en) {
          this.err('TN0004', `'${e.name}' is an enum; pick one of its members.`, e.loc, {
            expected: en.members.map((m) => `${e.name}.${m}`).join(' | '), actual: e.name,
            fix: { description: `Write ${e.name}.${en.members[0] ?? 'Member'}` },
          });
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
      case 'Field': return this.checkField(e, scope);
      case 'List': return this.checkList(e, scope);
      case 'EnumVal': return this.enums.get(e.enumName) ?? T.unknown;
      case 'Unwrap': { const t = this.checkExpr(e.expr, scope); return t.k === 'newtype' ? t.inner : T.unknown; }
      case 'Record': return this.checkRecord(e, scope);
      case 'If': return this.checkIf(e, scope, true);
      case 'Match': return this.checkMatch(e, scope, true);
    }
  }

  checkList(e: Extract<Expr, { kind: 'List' }>, scope: Scope): Ty {
    let elem: Ty = T.unknown;
    for (const item of e.items) {
      const t = this.checkExpr(item, scope);
      const u = unify(elem, t);
      if (u) elem = u;
      else {
        this.err('TN0002', `Type '${tyStr(t)}' is not assignable to type '${tyStr(elem)}'; every item in a list has the same type.`, item.loc, {
          expected: tyStr(elem), actual: tyStr(t), fix: { description: 'Make every item the same type' },
        });
      }
    }
    return T.list(elem);
  }

  checkRecord(e: RecordExpr, scope: Scope): Ty {
    if (e.spread) {
      const base = this.checkExpr(e.spread, scope);
      const rec = base.k === 'nullable' ? base.inner : base;
      if (base.k === 'unknown') { for (const f of e.fields) this.checkExpr(f.value, scope); return T.unknown; }
      if (rec.k !== 'record') {
        this.err('TN0002', `Only a record can be copied with '...'; '${this.txt(e.spread.loc)}' is ${tyStr(base)}.`, e.spread.loc, { expected: 'a record value', actual: tyStr(base) });
        for (const f of e.fields) this.checkExpr(f.value, scope);
        return T.unknown;
      }
      if (base.k === 'nullable') {
        this.err('TN3002', `'${this.txt(e.spread.loc)}' may be null, so it cannot be copied yet.`, e.spread.loc, {
          expected: tyStr(rec), actual: tyStr(base), fix: { description: `Check for null first: if (${this.txt(e.spread.loc)} !== null) { ... }` },
        });
      }
      const seen: string[] = [];
      for (const f of e.fields) {
        const t = this.checkExpr(f.value, scope);
        if (seen.includes(f.name)) { this.err('TN0007', `Duplicate field '${f.name}' in record.`, f.nameLoc, { fix: { description: 'Remove the duplicate field' } }); continue; }
        seen.push(f.name);
        const want = rec.fields.find(([n]) => n === f.name);
        if (!want) {
          const names = rec.fields.map(([n]) => n);
          const guess = nearestField(f.name, names);
          this.err('TN5005', `'${f.name}' is not a field of type '${tyStr(rec)}'.`, f.nameLoc, {
            expected: `one of: ${names.join(', ')}`, actual: f.name,
            fix: guess ? { description: `Did you mean '${guess}'?`, edit: { loc: f.nameLoc, newText: guess } } : { description: `Remove '${f.name}', or add it to type ${tyStr(rec)}` },
          });
          continue;
        }
        this.reportAssign(t, want[1], f.value);
      }
      return rec;
    }
    const fields: [string, Ty][] = [];
    for (const f of e.fields) {
      const t = this.checkExpr(f.value, scope);
      if (fields.some(([n]) => n === f.name)) {
        this.err('TN0007', `Duplicate field '${f.name}' in record.`, f.nameLoc, { fix: { description: 'Remove the duplicate field' } });
        continue;
      }
      fields.push([f.name, t]);
    }
    return { k: 'record', fields };
  }

  checkField(e: Extract<Expr, { kind: 'Field' }>, scope: Scope): Ty {
    // `Status.Draft`: an enum's name followed by one of its members
    if (e.obj.kind === 'Ident' && !scope.lookup(e.obj.name) && this.enums.has(e.obj.name)) {
      const en = this.enums.get(e.obj.name)!;
      if (!en.members.includes(e.name)) {
        const guess = nearest(e.name, en.members);
        this.err('TN2003', `'${e.name}' is not a member of enum '${en.name}'.`, e.nameLoc, {
          expected: `one of: ${en.members.join(', ')}`, actual: e.name,
          fix: guess ? { description: `Did you mean '${guess}'?`, edit: { loc: e.nameLoc, newText: guess } } : { description: `Use one of the members of ${en.name}` },
        });
        return T.unknown;
      }
      Object.assign(e, { kind: 'EnumVal', enumName: en.name, member: e.name });
      return en;
    }
    const ot = this.checkExpr(e.obj, scope);
    if (ot.k === 'unknown') return T.unknown;
    const objText = this.txt(e.obj.loc);
    const rec = ot.k === 'nullable' ? ot.inner : ot;
    if (rec.k === 'newtype') {
      if (e.name === 'value' && ot.k !== 'nullable') {
        Object.assign(e, { kind: 'Unwrap', expr: e.obj, inner: innerTs(rec.inner) });
        return rec.inner;
      }
      this.err(ot.k === 'nullable' ? 'TN3002' : 'TN0002', ot.k === 'nullable'
        ? `'${objText}' may be null, so its value cannot be read yet.`
        : `'${rec.name}' wraps a ${tyStr(rec.inner)}; read it with '.value'.`, e.nameLoc, {
        expected: `${objText}.value`, actual: `${objText}.${e.name}`,
        fix: ot.k === 'nullable' ? { description: `Check for null first: if (${objText} !== null) { ... }` } : { description: `Use .value`, edit: { loc: e.nameLoc, newText: 'value' } },
      });
      return T.unknown;
    }
    if (rec.k !== 'record') {
      const useLen = (ot.k === 'string' || ot.k === 'list') && e.name === 'length';
      this.err('TN0002', `Type '${tyStr(ot)}' has no fields.`, e.loc, {
        expected: 'a record value', actual: tyStr(ot),
        fix: useLen
          ? { description: `Use the builtin len(x) for the length of a ${ot.k}`, edit: { loc: e.loc, newText: `len(${objText})` } }
          : { description: 'Only record types (type Name = { ... }) have fields; use builtin functions for strings, numbers and lists' },
      });
      return T.unknown;
    }
    if (ot.k === 'nullable') {
      this.err('TN3002', `'${objText}' may be null, so its fields cannot be read yet.`, e.obj.loc, {
        expected: tyStr(rec), actual: tyStr(ot),
        fix: { description: `Check for null first: if (${objText} !== null) { ... } (or compare with === null and return early)` },
      });
    }
    const f = rec.fields.find(([n]) => n === e.name);
    if (!f) {
      const names = rec.fields.map(([n]) => n);
      const guess = nearestField(e.name, names);
      this.err('TN5004', `Field '${e.name}' does not exist on type '${tyStr(rec)}'.`, e.nameLoc, {
        expected: `one of: ${names.join(', ')}`, actual: e.name,
        fix: guess
          ? { description: `Did you mean '${guess}'?`, edit: { loc: e.nameLoc, newText: guess } }
          : { description: `Use one of the fields of ${tyStr(rec)}: ${names.join(', ')}` },
      });
      return T.unknown;
    }
    // `if (c.email !== null)` has already been checked on this path
    const path = pathOf(e);
    if (f[1].k === 'nullable' && path !== null && scope.pathNarrowed(path)) return f[1].inner;
    return f[1];
  }

  /** Who may call whom: client -> server crosses the network; server and shared code cannot call the client. */
  checkSides(e: Extract<Expr, { kind: 'Call' }>, callee: Sig): void {
    const from = this.curSide, to = callee.side;
    if (to === 'shared' || from === to) return;
    if (from === 'client') {
      if (!this.boundary.has(e.name)) this.boundary.set(e.name, e.loc);
      return;
    }
    if (from === 'server') {
      this.err('TN5003', `Server code cannot call client fn '${e.name}'.`, e.loc, {
        expected: 'a call to a server fn or a shared fn', actual: `call to client fn '${e.name}'`,
        fix: { description: 'Return the data from the server fn and let client code do the client-side work' },
      });
      return;
    }
    this.err('TN5003', `A shared fn runs on both sides, so it cannot call ${to} fn '${e.name}'.`, e.loc, {
      expected: 'a call to another shared fn', actual: `call to ${to} fn '${e.name}'`,
      fix: to === 'client' && this.curFn
        ? { description: "Mark this function 'client fn'", edit: { loc: this.zeroAt(this.curFn.fnLoc), newText: 'client ' } }
        : { description: "Mark this function 'client fn' (to call the server over the network) or 'server fn'" },
    });
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
        fix: lt.k === 'newtype' && rt.k === lt.inner.k ? { description: `Compare the plain values: ${this.txt(e.left.loc)}.value` } : undefined,
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
    // `Cents(500)`: wrapping a plain value in a newtype
    const nt = this.newtypes.get(e.name);
    if (nt) {
      const argTys = e.args.map((a) => this.checkExpr(a, scope));
      if (e.args.length !== 1) {
        this.err('TN0005', `Expected 1 argument, but got ${e.args.length}.`, e.loc, { expected: `${nt.name}(${tyStr(nt.inner)})`, actual: `${e.args.length} arguments` });
        return nt;
      }
      if (argTys[0].k === 'newtype' && argTys[0].name === nt.name) {
        this.err('TN0002', `'${this.txt(e.args[0].loc)}' is already a ${nt.name}.`, e.args[0].loc, {
          expected: tyStr(nt.inner), actual: nt.name, fix: { description: 'Use the value as it is', edit: { loc: e.loc, newText: this.txt(e.args[0].loc) } },
        });
        return nt;
      }
      this.reportAssign(argTys[0], nt.inner, e.args[0]);
      return nt;
    }
    const own = this.fns.get(e.name);
    const pre = own ? undefined : PRELUDE[e.name];
    const argTys = e.args.map((a) => this.checkExpr(a, scope));
    let sig: Sig | undefined = own;
    if (pre) {
      if (pre.generic) {
        const g = pre.generic(argTys);
        if (!g) {
          this.err('TN0002', `'${e.name}' works on lists: ${pre.sig ?? e.name}.`, e.args[0]?.loc ?? e.loc, {
            expected: pre.sig ?? `${e.name}(List<T>, ...)`, actual: `${e.name}(${argTys.map(tyStr).join(', ')})`,
            fix: { description: `Pass a List as the first argument` },
          });
          return pre.ret.k === 'list' ? T.list(T.unknown) : pre.ret.k === 'nullable' ? T.unknown : pre.ret;
        }
        sig = { params: g.params, ret: g.ret, side: 'shared' };
      } else sig = { params: pre.params, ret: pre.ret, side: 'shared' };
    }
    if (own) this.checkSides(e, own);
    if (pre?.side === 'server' && this.curSide !== 'server') {
      const shared = this.curSide === 'shared';
      this.err('TN5001', `'${e.name}' can only be used in a server fn; secrets never reach the client.`, e.loc, {
        expected: 'server-only code inside a server fn', actual: `${e.name}(...) in a ${this.curSide} fn`,
        fix: shared && this.curFn
          ? { description: "Mark this function 'server fn'", edit: { loc: this.zeroAt(this.curFn.fnLoc), newText: 'server ' } }
          : { description: "Move this into a 'server fn' that returns only what the client needs, and call that from here" },
      });
    }
    if (!sig) {
      const s = nearest(e.name, [...this.fns.keys(), ...Object.keys(PRELUDE), 'ok', 'err', ...this.newtypes.keys()]);
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

export function check(program: Program, file: string, src: string): CheckResult {
  return new Checker(src, file).run(program);
}
