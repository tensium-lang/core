// This file reads the pieces from the lexer and works out the structure of the program,
// the way you find the subject and verb in a sentence. It builds the building blocks
// described in ast.ts. If it finds a typo, it writes it down and keeps going so one run
// can report many mistakes.

import { Arm, Block, EnumDecl, Expr, Fn, IfExpr, MatchExpr, NewtypeDecl, Param, Program, RecordField, Side, Stmt, TypeDecl, TypeField, TypeNode } from './ast.ts';
import { Diagnostic, Loc, join, mkDiag } from './diagnostics.ts';
import { Token, lex } from './lexer.ts';

const RESERVED = new Set([
  'fn', 'function', 'let', 'const', 'var', 'mut', 'return', 'if', 'else', 'match', 'for', 'while', 'in', 'throw', 'try', 'catch',
  'true', 'false', 'null', 'undefined', 'export', 'class', 'async', 'await', 'new', 'enum', 'newtype',
]);

/** Words JavaScript reserves: fine as record field names, but not as the name of a binding or function. */
const JS_RESERVED = new Set([
  'void', 'typeof', 'delete', 'in', 'instanceof', 'this', 'super', 'switch', 'case', 'default', 'do', 'break', 'continue',
  'debugger', 'import', 'extends', 'finally', 'static', 'package', 'private', 'protected', 'public', 'implements', 'with', 'yield',
  'arguments', 'eval', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Promise', 'JSON', 'Math',
]);
const BINDING_KINDS = new Set(['variable name', 'parameter name', 'function name', 'loop variable', 'binding name']);

const BINOPS: Record<string, number> = {
  '||': 1, '&&': 2,
  '==': 3, '!=': 3, '===': 3, '!==': 3,
  '<': 4, '>': 4, '<=': 4, '>=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
};

function blockHasReturn(b: Block): boolean {
  return b.stmts.some((s) => s.kind === 'Return' || (s.kind === 'ExprStmt' && hasReturn(s.expr))) || (!!b.tail && hasReturn(b.tail));
}
function hasReturn(e: Expr): boolean {
  if (e.kind === 'If') return blockHasReturn(e.then) || (!!e.else && (e.else.kind === 'If' ? hasReturn(e.else) : blockHasReturn(e.else)));
  if (e.kind === 'Match') return e.arms.some((a) => blockHasReturn(a.body));
  return false;
}

class ParseError extends Error {
  constructor(public diag: Diagnostic) { super(diag.message); }
}

const zero = (l: Loc): Loc => ({ ...l, endLine: l.startLine, endCol: l.startCol, eo: l.so });
const after = (l: Loc): Loc => ({ ...l, startLine: l.endLine, startCol: l.endCol, so: l.eo });

class Parser {
  toks: Token[];
  p = 0;
  diags: Diagnostic[] = [];
  constructor(private src: string, private file: string, toks: Token[]) { this.toks = toks; }

  // ---- token helpers
  peek(o = 0): Token { return this.toks[Math.min(this.p + o, this.toks.length - 1)]; }
  next(): Token { const t = this.peek(); if (t.kind !== 'eof') this.p++; return t; }
  prev(): Token { return this.toks[Math.max(this.p - 1, 0)]; }
  isP(text: string, o = 0): boolean { const t = this.peek(o); return t.kind === 'punct' && t.text === text; }
  isKw(text: string, o = 0): boolean { const t = this.peek(o); return t.kind === 'ident' && t.text === text; }
  eatP(text: string): boolean { if (this.isP(text)) { this.p++; return true; } return false; }
  eof(): boolean { return this.peek().kind === 'eof'; }
  desc(t: Token): string { return t.kind === 'eof' ? 'end of file' : `'${t.text}'`; }
  slice(l: Loc): string { return this.src.slice(l.so, l.eo); }

  fail(message: string, loc: Loc, expected: string, actual: string, code = 'TN0001'): never {
    throw new ParseError(mkDiag(code, message, loc, { expected, actual }));
  }

  expectP(text: string): Token {
    if (this.isP(text)) return this.next();
    const t = this.peek();
    // report at the end of the previous token, like tsc does for missing punctuation
    const loc = text === ';' || text === ')' || text === '}' || text === ']' ? after(this.prev().loc) : t.loc;
    return this.fail(`'${text}' expected.`, loc, `'${text}'`, this.desc(t));
  }

  expectIdent(what = 'identifier'): Token {
    const t = this.peek();
    if (t.kind === 'ident' && !RESERVED.has(t.text)) {
      // a name that JavaScript keeps for itself cannot name a binding or a function (fields are fine)
      if (BINDING_KINDS.has(what) && JS_RESERVED.has(t.text)) {
        this.fail(`'${t.text}' cannot be used as a ${what}; it is a reserved word.`, t.loc, what, `'${t.text}'`, 'TN0003');
      }
      return this.next();
    }
    return this.fail(`${what[0].toUpperCase()}${what.slice(1)} expected.`, t.loc, what, this.desc(t));
  }

  /** The last location of a just-parsed statement: its ';' if there was one, else the end of its expression. */
  endOfStmt(last: { loc: Loc }): Loc {
    const p = this.prev();
    return p.kind === 'punct' && p.text === ';' ? p.loc : last.loc;
  }

  /** A missing `;` is recorded with an insertion fix and parsing continues. */
  expectSemi(): void {
    if (this.eatP(';')) return;
    const loc = zero(after(this.prev().loc));
    this.diags.push(mkDiag('TN0001', "';' expected.", loc, {
      expected: "';'", actual: this.desc(this.peek()),
      fix: { description: "Insert ';'", edit: { loc, newText: ';' } },
    }));
  }

  // ---- program / functions
  isFnKw(o = 0): boolean { return this.isKw('fn', o) || this.isKw('function', o); }
  isSideKw(o = 0): boolean { return (this.isKw('server', o) || this.isKw('client', o)) && this.isFnKw(o + 1); }
  isTypeKw(): boolean { return (this.isKw('type') || this.isKw('interface') || this.isKw('enum') || this.isKw('newtype')) && this.peek(1).kind === 'ident'; }
  /** True at the start of something that can appear at the top level of a file. */
  atTopStart(): boolean { return this.isFnKw() || this.isSideKw() || this.isTypeKw() || this.isKw('export'); }

  parseProgram(): Program {
    const fns: Fn[] = [];
    const types: TypeDecl[] = [];
    const enums: EnumDecl[] = [];
    const newtypes: NewtypeDecl[] = [];
    while (!this.eof()) {
      const startPos = this.p;
      try {
        if (this.isKw('export')) {
          const t = this.next();
          this.diags.push(mkDiag('TN0003', "'export' is not used in Tensium; every function is exported.", t.loc, {
            expected: 'fn declaration', actual: "'export'",
            fix: { description: "Remove 'export'", edit: { loc: { ...t.loc, endCol: t.loc.endCol + 1, eo: t.loc.eo + 1 }, newText: '' } },
          }));
        }
        if (this.isKw('enum') && this.peek(1).kind === 'ident') enums.push(this.parseEnumDecl());
        else if (this.isKw('newtype') && this.peek(1).kind === 'ident') newtypes.push(this.parseNewtypeDecl());
        else if (this.isTypeKw()) types.push(this.parseTypeDecl());
        else if (this.isSideKw()) { const side = this.next(); fns.push(this.parseFn(side.text as Side, side.loc)); }
        else if (this.isFnKw()) fns.push(this.parseFn('shared'));
        else {
          const t = this.peek();
          this.fail(`Unexpected ${this.desc(t)}; expected a function or type declaration.`, t.loc, "'fn', 'server fn', 'client fn', 'type', 'enum' or 'newtype'", this.desc(t));
        }
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        this.diags.push(e.diag);
        if (this.p === startPos || !this.atTopStart()) this.next();
        while (!this.eof() && !this.atTopStart()) this.next();
      }
    }
    return { types, enums, newtypes, fns };
  }

  /** `type Name = { field: type, ... }` (a TypeScript-style `interface Name { ... }` is accepted with a fix). */
  parseTypeDecl(): TypeDecl {
    const kw = this.next();
    const name = this.expectIdent('type name');
    if (kw.text === 'interface') {
      this.diags.push(mkDiag('TN0003', "Use 'type Name = { ... }' to declare a record type.", kw.loc, {
        expected: `type ${name.text} = { ... }`, actual: `interface ${name.text} { ... }`,
        fix: { description: "Replace 'interface Name' with 'type Name ='", edit: { loc: join(kw.loc, name.loc), newText: `type ${name.text} =` } },
      }));
      this.eatP('=');
    } else this.expectP('=');
    this.expectP('{');
    const fields: TypeField[] = [];
    while (!this.isP('}')) {
      const f = this.expectIdent('field name');
      this.expectP(':');
      fields.push({ name: f.text, nameLoc: f.loc, typeNode: this.parseType() });
      if (!this.eatP(',') && !this.eatP(';')) break;
    }
    const close = this.expectP('}');
    this.eatP(';');
    return { name: name.text, nameLoc: name.loc, fields, loc: join(kw.loc, close.loc) };
  }

  /** `enum Status { Draft, Sent, Paid }` */
  parseEnumDecl(): EnumDecl {
    const kw = this.next();
    const name = this.expectIdent('enum name');
    this.expectP('{');
    const members: EnumDecl['members'] = [];
    while (!this.isP('}')) {
      const m = this.expectIdent('member name');
      if (this.isP('=') || this.isP('(')) this.fail('Enum members are plain names; they carry no values.', this.peek().loc, "',' or '}'", this.desc(this.peek()));
      members.push({ name: m.text, loc: m.loc });
      if (!this.eatP(',')) break;
    }
    const close = this.expectP('}');
    this.eatP(';');
    return { name: name.text, nameLoc: name.loc, members, loc: join(kw.loc, close.loc) };
  }

  /** `newtype Cents = number;` */
  parseNewtypeDecl(): NewtypeDecl {
    const kw = this.next();
    const name = this.expectIdent('newtype name');
    this.expectP('=');
    const typeNode = this.parseType();
    this.expectSemi();
    return { name: name.text, nameLoc: name.loc, typeNode, loc: join(kw.loc, typeNode.loc) };
  }

  parseFn(side: Side, sideLoc?: Loc): Fn {
    const start = this.next();
    if (start.text === 'function') {
      this.diags.push(mkDiag('TN0003', "Use 'fn' to declare functions.", start.loc, {
        expected: "'fn'", actual: "'function'",
        fix: { description: "Replace 'function' with 'fn'", edit: { loc: start.loc, newText: 'fn' } },
      }));
    }
    const name = this.expectIdent('function name');
    this.expectP('(');
    const params: Param[] = [];
    while (!this.isP(')')) {
      const n = this.expectIdent('parameter name');
      const typeNode = this.eatP(':') ? this.parseType() : undefined;
      params.push({ name: n.text, nameLoc: n.loc, typeNode });
      if (!this.eatP(',')) break;
    }
    const rparen = this.expectP(')');
    const retNode = this.eatP(':') ? this.parseType() : undefined;
    const body = this.parseBlock();
    // A trailing expression in a function body is not a return value in Tensium.
    if (body.tail) {
      const tail = body.tail;
      const valueFn = !!retNode && !(retNode.kind === 'TypeName' && retNode.name === 'void');
      const blockLike = tail.kind === 'If' || tail.kind === 'Match';
      // a trailing if/match whose branches `return` is an ordinary statement, not a missing `return`
      if (!blockLike || (valueFn && !hasReturn(tail))) {
        const text = this.slice(tail.loc);
        this.diags.push(mkDiag('TN0009', "Function body ends with an expression; use 'return' to return a value.", tail.loc, {
          expected: 'return statement', actual: 'expression',
          fix: { description: `Replace with 'return ${text};'`, edit: { loc: tail.loc, newText: `return ${text};` } },
        }));
        body.stmts.push({ kind: 'Return', expr: tail, loc: tail.loc });
      } else {
        body.stmts.push({ kind: 'ExprStmt', expr: tail, loc: tail.loc });
      }
      body.tail = undefined;
    }
    return { side, fnLoc: start.loc, name: name.text, nameLoc: name.loc, params, retNode, rparenLoc: rparen.loc, body, loc: join(sideLoc ?? start.loc, body.loc) };
  }

  // ---- types
  parseType(): TypeNode {
    const t = this.expectIdent('type');
    let ty: TypeNode;
    if (t.text === 'Result' && this.isP('<')) {
      this.next();
      const ok = this.parseType();
      this.expectP(',');
      const err = this.parseType();
      const close = this.expectP('>');
      ty = { kind: 'TypeResult', ok, err, loc: join(t.loc, close.loc) };
    } else if (t.text === 'List' && this.isP('<')) {
      this.next();
      const elem = this.parseType();
      const close = this.expectP('>');
      ty = { kind: 'TypeList', elem, loc: join(t.loc, close.loc) };
    } else {
      ty = { kind: 'TypeName', name: t.text, loc: t.loc };
    }
    if (this.isP('[')) {
      const open = this.next();
      const close = this.expectP(']');
      this.diags.push(mkDiag('TN0003', `Use 'List<${this.slice(ty.loc)}>' for a list type.`, join(ty.loc, close.loc), {
        expected: `List<${this.slice(ty.loc)}>`, actual: `${this.slice(ty.loc)}[]`,
        fix: { description: "Write the list type as List<T>", edit: { loc: join(ty.loc, close.loc), newText: `List<${this.slice(ty.loc)}>` } },
      }));
      ty = { kind: 'TypeList', elem: ty, loc: join(ty.loc, close.loc) };
      void open;
    }
    while (this.isP('|')) {
      this.next();
      const n = this.peek();
      if (n.kind === 'ident' && (n.text === 'null' || n.text === 'undefined')) {
        this.next();
        ty = { kind: 'TypeNullable', inner: ty, nullLoc: n.loc, viaUndefined: n.text === 'undefined', loc: join(ty.loc, n.loc) };
      } else {
        this.fail("Only 'T | null' unions are supported.", n.loc, "'null'", this.desc(n));
      }
    }
    return ty;
  }

  // ---- blocks and statements
  parseBlock(): Block {
    const open = this.expectP('{');
    const stmts: Stmt[] = [];
    let tail: Expr | undefined;
    while (!this.isP('}')) {
      if (this.eof()) this.fail("'}' expected.", after(this.prev().loc), "'}'", 'end of file');
      const startPos = this.p;
      try {
        const item = this.parseStmt();
        if ('tail' in item) tail = item.tail; else stmts.push(item);
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        this.diags.push(e.diag);
        this.recoverStmt();
        if (this.p === startPos) this.next();
      }
    }
    const close = this.next();
    return { kind: 'Block', stmts, tail, loc: join(open.loc, close.loc), closeLoc: close.loc };
  }

  recoverStmt(): void {
    let depth = 0;
    while (!this.eof()) {
      if (this.isP(';') && depth === 0) { this.next(); return; }
      if (this.isP('{')) depth++;
      if (this.isP('}')) { if (depth === 0) return; depth--; }
      this.next();
    }
  }

  parseStmt(): Stmt | { tail: Expr } {
    const t = this.peek();
    if (t.kind === 'ident') {
      if (t.text === 'let' || t.text === 'const' || t.text === 'var') {
        this.next();
        if (t.text !== 'let') {
          this.diags.push(mkDiag('TN0003', `Use 'let' for bindings (and 'let mut' for one that can change).`, t.loc, {
            expected: "'let'", actual: `'${t.text}'`,
            fix: { description: `Replace '${t.text}' with 'let'`, edit: { loc: t.loc, newText: 'let' } },
          }));
        }
        const mut = this.isKw('mut') ? (this.next(), true) : false;
        const name = this.expectIdent('variable name');
        const typeNode = this.eatP(':') ? this.parseType() : undefined;
        this.expectP('=');
        const init = this.parseExpr();
        this.expectSemi();
        return { kind: 'Let', mut, name: name.text, nameLoc: name.loc, typeNode, init, loc: join(t.loc, init.loc) };
      }
      if (t.text === 'return') {
        this.next();
        const expr = this.isP(';') ? undefined : this.parseExpr();
        this.expectSemi();
        // the statement's span includes its ';' so a replacement edit leaves no stray semicolon behind
        return { kind: 'Return', expr, loc: join(t.loc, this.endOfStmt(expr ?? { loc: t.loc })) };
      }
      if (t.text === 'for') {
        this.next();
        this.expectP('(');
        if (this.isKw('let') || this.isKw('const')) this.next();
        const name = this.expectIdent('loop variable');
        if (!this.isKw('in')) {
          this.fail("Loops are 'for (item in list) { ... }'; there is no counting for loop (use range(a, b) to make a list of numbers).",
            this.peek().loc, "'in'", this.desc(this.peek()), 'TN0003');
        }
        this.next();
        const iter = this.parseExpr();
        this.expectP(')');
        const body = this.parseBlock();
        return { kind: 'For', name: name.text, nameLoc: name.loc, iter, body, loc: join(t.loc, body.loc) };
      }
      if (t.text === 'while') {
        this.next();
        this.expectP('(');
        const cond = this.parseExpr();
        this.expectP(')');
        const body = this.parseBlock();
        return { kind: 'While', cond, body, loc: join(t.loc, body.loc) };
      }
      if (t.text === 'throw') {
        this.next();
        const expr = this.parseExpr();
        this.expectSemi();
        return { kind: 'Throw', expr, loc: join(t.loc, this.endOfStmt(expr)) };
      }
      if (t.text === 'try') {
        this.next();
        const b = this.parseBlock();
        if (this.isKw('catch')) {
          this.next();
          if (this.eatP('(')) { this.expectIdent(); this.expectP(')'); }
          this.parseBlock();
        }
        return { kind: 'Try', loc: join(t.loc, this.prev().loc) };
      }
    }
    const blockLike = this.isKw('if') || this.isKw('match');
    const expr = blockLike ? this.parsePrimary() : this.parseExpr();
    if (this.isP('=')) {
      const eq = this.next();
      if (expr.kind === 'Field') {
        this.fail(`Record fields cannot be changed; make a changed copy instead: { ...${this.slice(expr.obj.loc)}, ${expr.name}: <new value> }.`,
          join(expr.loc, eq.loc), 'a let binding, or a new record built with { ...old, field: value }', `assignment to '${this.slice(expr.loc)}'`, 'TN0012');
      }
      if (expr.kind !== 'Ident') this.fail('Only a variable can be assigned to.', expr.loc, 'variable name', this.slice(expr.loc), 'TN0012');
      const value = this.parseExpr();
      this.expectSemi();
      return { kind: 'Assign', name: expr.name, nameLoc: expr.loc, expr: value, loc: join(expr.loc, this.endOfStmt(value)) };
    }
    if (this.isP(';')) { const semi = this.next(); return { kind: 'ExprStmt', expr, loc: join(expr.loc, semi.loc) }; }
    if (this.isP('}')) return { tail: expr };
    if (blockLike) return { kind: 'ExprStmt', expr, loc: expr.loc };
    this.expectSemi();
    return { kind: 'ExprStmt', expr, loc: expr.loc };
  }

  // ---- expressions
  parseExpr(minPrec = 1): Expr {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      const prec = t.kind === 'punct' ? BINOPS[t.text] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      this.next();
      const right = this.parseExpr(prec + 1);
      left = { kind: 'Binary', op: t.text, left, right, loc: join(left.loc, right.loc) };
    }
  }

  parseUnary(): Expr {
    const t = this.peek();
    if (t.kind === 'punct' && (t.text === '!' || t.text === '-')) {
      this.next();
      const expr = this.parseUnary();
      return { kind: 'Unary', op: t.text, expr, loc: join(t.loc, expr.loc) };
    }
    return this.parsePrimary();
  }

  /** An atom followed by any number of `.field` accesses. */
  parsePrimary(): Expr {
    let e = this.parseAtom();
    for (;;) {
      if (this.isP('.')) {
        this.next();
        const name = this.expectIdent('field name');
        if (this.isP('(')) {
          this.fail(`Method calls are not supported; use a builtin function instead of '.${name.text}(...)'.`, name.loc,
            'a builtin such as len(xs), get(xs, i), push(xs, x), toUpper(s)', `.${name.text}(...)`, 'TN0003');
        }
        e = { kind: 'Field', obj: e, name: name.text, nameLoc: name.loc, loc: join(e.loc, name.loc) };
      } else if (this.isP('[')) {
        const open = this.next();
        const idx = this.parseExpr();
        const close = this.expectP(']');
        const loc = join(e.loc, close.loc);
        this.diags.push(mkDiag('TN0003', 'Indexing with [i] is not supported; use get(list, i), which gives T | null.', loc, {
          expected: `get(${this.slice(e.loc)}, ${this.slice(idx.loc)})`, actual: this.slice(loc),
          fix: { description: 'Use get(list, i) and check the result for null', edit: { loc, newText: `get(${this.slice(e.loc)}, ${this.slice(idx.loc)})` } },
        }));
        e = { kind: 'Call', name: 'get', nameLoc: open.loc, args: [e, idx], loc };
      } else return e;
    }
  }

  /** `{ a: 1, b }` or `{ ...base, a: 1 }` — only reached in expression position, where a block cannot appear. */
  parseRecord(): Expr {
    const open = this.next();
    const fields: RecordField[] = [];
    let spread: Expr | undefined;
    if (this.isP('...')) {
      this.next();
      spread = this.parseExpr();
      if (!this.eatP(',') && !this.isP('}')) this.expectP(',');
    }
    while (!this.isP('}')) {
      if (this.isP('...')) this.fail('Only one spread is allowed in a record, and it must come first.', this.peek().loc, 'field name', "'...'");
      const n = this.expectIdent('field name');
      const value: Expr = this.eatP(':') ? this.parseExpr() : { kind: 'Ident', name: n.text, loc: n.loc };
      fields.push({ name: n.text, nameLoc: n.loc, value });
      if (!this.eatP(',')) break;
    }
    const close = this.expectP('}');
    return { kind: 'Record', spread, fields, loc: join(open.loc, close.loc) };
  }

  /** In a match arm, `{` usually opens a block; `{ name: ...`, `{ name, ...` or `{ ...x` can only be a record value. */
  recordAhead(): boolean {
    if (!this.isP('{')) return false;
    if (this.isP('...', 1)) return true;
    return this.peek(1).kind === 'ident' && !RESERVED.has(this.peek(1).text) && (this.isP(':', 2) || this.isP(',', 2));
  }

  parseAtom(): Expr {
    const t = this.peek();
    if (t.kind === 'punct' && t.text === '{') return this.parseRecord();
    if (t.kind === 'punct' && t.text === '[') {
      this.next();
      const items: Expr[] = [];
      while (!this.isP(']')) {
        items.push(this.parseExpr());
        if (!this.eatP(',')) break;
      }
      const close = this.expectP(']');
      return { kind: 'List', items, loc: join(t.loc, close.loc) };
    }
    if (t.kind === 'num') { this.next(); return { kind: 'Num', value: t.value as number, loc: t.loc }; }
    if (t.kind === 'str') { this.next(); return { kind: 'Str', value: t.value as string, loc: t.loc }; }
    if (t.kind === 'punct' && t.text === '(') {
      this.next();
      const e = this.parseExpr();
      this.expectP(')');
      return e;
    }
    if (t.kind === 'ident') {
      switch (t.text) {
        case 'true': case 'false': this.next(); return { kind: 'Bool', value: t.text === 'true', loc: t.loc };
        case 'null': this.next(); return { kind: 'Null', loc: t.loc };
        case 'undefined': this.next(); return { kind: 'Undef', loc: t.loc };
        case 'if': return this.parseIf();
        case 'match': return this.parseMatch();
      }
      if (!RESERVED.has(t.text)) {
        this.next();
        if (this.isP('(')) {
          this.next();
          const args: Expr[] = [];
          while (!this.isP(')')) {
            args.push(this.parseExpr());
            if (!this.eatP(',')) break;
          }
          const close = this.expectP(')');
          return { kind: 'Call', name: t.text, nameLoc: t.loc, args, loc: join(t.loc, close.loc) };
        }
        return { kind: 'Ident', name: t.text, loc: t.loc };
      }
    }
    return this.fail('Expression expected.', t.loc, 'expression', this.desc(t));
  }

  parseIf(): IfExpr {
    const kw = this.next();
    this.expectP('(');
    const cond = this.parseExpr();
    this.expectP(')');
    const then = this.parseBlock();
    let els: Block | IfExpr | undefined;
    if (this.isKw('else')) {
      this.next();
      els = this.isKw('if') ? this.parseIf() : this.parseBlock();
    }
    return { kind: 'If', cond, then, else: els, loc: join(kw.loc, this.prev().loc) };
  }

  parseMatch(): MatchExpr {
    const kw = this.next();
    const scrut = this.parseExpr();
    this.expectP('{');
    const arms: Arm[] = [];
    while (!this.isP('}')) {
      const pat = this.expectIdent('pattern (ok, err or an enum member)');
      let bind: Token | undefined;
      if (this.eatP('(')) {
        bind = this.expectIdent('binding name');
        this.expectP(')');
      }
      this.expectP('=>');
      let body: Block;
      if (this.isP('{') && !this.recordAhead()) body = this.parseBlock();
      else {
        const e = this.parseExpr();
        body = { kind: 'Block', stmts: [], tail: e, loc: e.loc, closeLoc: e.loc };
      }
      arms.push({ pat: pat.text, patLoc: pat.loc, bind: bind?.text, bindLoc: bind?.loc, body, loc: join(pat.loc, body.loc) });
      if (!this.eatP(',') && !this.isP('}') && body.tail && body.closeLoc === body.loc) {
        this.expectP(',');
      }
    }
    const close = this.next();
    return { kind: 'Match', scrut, arms, headLoc: join(kw.loc, scrut.loc), closeLoc: close.loc, loc: join(kw.loc, close.loc) };
  }
}

export function parse(src: string, file: string): { program: Program; diagnostics: Diagnostic[] } {
  const { tokens, diagnostics } = lex(src, file);
  const parser = new Parser(src, file, tokens);
  const program = parser.parseProgram();
  return { program, diagnostics: [...diagnostics, ...parser.diags] };
}
