// This file is the writer. After a program passes every check, this turns it into
// TypeScript, a language that computers already know how to run. It also copies the
// program's top comment into the new file and adds the small helper tools the program uses.

import { Block, Expr, Fn, IfExpr, MatchExpr, Program, Stmt, TypeNode } from './ast.ts';
import { PRELUDE } from './prelude.ts';

const helpers = () => `// Small helper tools that Tensium programs are allowed to use (like parseInt, len, and str).
// They live in this one object so the program's own function names never clash with them.
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
const __ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
const __err = <E>(error: E): { ok: false; error: E } => ({ ok: false, error });
const __tn = {
${Object.entries(PRELUDE).map(([k, b]) => `  ${k}: ${b.impl},`).join('\n')}
};
`;

/** The top of every generated file: the .tn file's own explanation, plus a note that this file is machine-written. */
function header(explanation: string[]): string {
  const own = explanation.map((l) => `// ${l}`.trimEnd()).join('\n');
  return `${own}\n//\n// NOTE: the Tensium compiler wrote this TypeScript file from a .tn file.\n// Change the .tn file instead; edits made here will be lost next time it is compiled.\n\n`;
}

function ty(n: TypeNode): string {
  switch (n.kind) {
    case 'TypeName': return n.name;
    case 'TypeResult': return `Result<${ty(n.ok)}, ${ty(n.err)}>`;
    case 'TypeNullable': return `${ty(n.inner)} | null`;
  }
}

class Emitter {
  private id = 0;
  private fresh = () => `__m${this.id++}`;

  program(p: Program, explanation: string[]): string {
    return header(explanation) + helpers() + '\n' + p.fns.map((f) => this.fn(f)).join('\n\n') + '\n';
  }

  fn(f: Fn): string {
    const params = f.params.map((p) => `${p.name}: ${ty(p.typeNode!)}`).join(', ');
    return `export function ${f.name}(${params}): ${ty(f.retNode!)} {\n${this.stmts(f.body.stmts, '  ')}\n}`;
  }

  stmts(ss: Stmt[], ind: string): string {
    return ss.map((s) => this.stmt(s, ind)).join('\n');
  }

  /** A block in statement position: statements, then the tail (if any) as a statement. */
  stmtBlock(b: Block, ind: string): string {
    const parts = [this.stmts(b.stmts, ind)];
    if (b.tail) parts.push(this.exprStmt(b.tail, ind));
    return parts.filter(Boolean).join('\n');
  }

  stmt(s: Stmt, ind: string): string {
    switch (s.kind) {
      case 'Let': return `${ind}const ${s.name}${s.typeNode ? `: ${ty(s.typeNode)}` : ''} = ${this.expr(s.init, ind)};`;
      case 'Return': return `${ind}return${s.expr ? ' ' + this.expr(s.expr, ind) : ''};`;
      case 'ExprStmt': return this.exprStmt(s.expr, ind);
      default: throw new Error('cannot emit code that failed checking');
    }
  }

  exprStmt(e: Expr, ind: string): string {
    if (e.kind === 'If') return this.ifStmt(e, ind);
    if (e.kind === 'Match') return this.matchStmt(e, ind);
    return `${ind}${this.expr(e, ind)};`;
  }

  ifStmt(e: IfExpr, ind: string): string {
    let out = `${ind}if (${this.expr(e.cond, ind)}) {\n${this.stmtBlock(e.then, ind + '  ')}\n${ind}}`;
    if (e.else) {
      out += e.else.kind === 'If'
        ? ` else ${this.ifStmt(e.else, ind).trimStart()}`
        : ` else {\n${this.stmtBlock(e.else, ind + '  ')}\n${ind}}`;
    }
    return out;
  }

  matchStmt(e: MatchExpr, ind: string): string {
    const m = this.fresh();
    const arm = (pat: string) => e.arms.find((a) => a.pat === pat)!;
    const ok = arm('ok'), er = arm('err');
    return `${ind}{\n${ind}  const ${m} = ${this.expr(e.scrut, ind)};\n` +
      `${ind}  if (${m}.ok) {\n${ind}    const ${ok.bind} = ${m}.value;\n${this.stmtBlock(ok.body, ind + '    ')}\n${ind}  } else {\n` +
      `${ind}    const ${er.bind} = ${m}.error;\n${this.stmtBlock(er.body, ind + '    ')}\n${ind}  }\n${ind}}`;
  }

  /** A block in value position: an expression that evaluates to the tail. */
  valueBlock(b: Block, ind: string): string {
    if (b.stmts.length === 0 && b.tail) return `(${this.expr(b.tail, ind)})`;
    return `(() => {\n${this.stmts(b.stmts, ind + '  ')}\n${ind}  return ${b.tail ? this.expr(b.tail, ind + '  ') : 'undefined'};\n${ind}})()`;
  }

  expr(e: Expr, ind: string): string {
    switch (e.kind) {
      case 'Num': return String(e.value);
      case 'Str': return JSON.stringify(e.value);
      case 'Bool': return String(e.value);
      case 'Null': case 'Undef': return 'null';
      case 'Ident': return e.name;
      case 'Unary': return `(${e.op}${this.expr(e.expr, ind)})`;
      case 'Binary': {
        const op = e.op === '==' ? '===' : e.op === '!=' ? '!==' : e.op;
        return `(${this.expr(e.left, ind)} ${op} ${this.expr(e.right, ind)})`;
      }
      case 'Call': {
        const args = e.args.map((a) => this.expr(a, ind)).join(', ');
        if (e.name === 'ok') return `__ok(${args})`;
        if (e.name === 'err') return `__err(${args})`;
        return PRELUDE[e.name] ? `__tn.${e.name}(${args})` : `${e.name}(${args})`;
      }
      case 'If': {
        const els = e.else!;
        const elseCode = els.kind === 'If' ? this.expr(els, ind) : this.valueBlock(els, ind);
        return `(${this.expr(e.cond, ind)} ? ${this.valueBlock(e.then, ind)} : ${elseCode})`;
      }
      case 'Match': {
        const m = this.fresh();
        const ok = e.arms.find((a) => a.pat === 'ok')!, er = e.arms.find((a) => a.pat === 'err')!;
        return `(() => {\n${ind}  const ${m} = ${this.expr(e.scrut, ind)};\n` +
          `${ind}  if (${m}.ok) { const ${ok.bind} = ${m}.value; return ${this.valueBlock(ok.body, ind + '  ')}; }\n` +
          `${ind}  else { const ${er.bind} = ${m}.error; return ${this.valueBlock(er.body, ind + '  ')}; }\n${ind}})()`;
      }
    }
  }
}

export function emit(p: Program, explanation: string[] = []): string {
  return new Emitter().program(p, explanation);
}
