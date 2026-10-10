// This file is the writer. After a program passes every check, this turns it into
// TypeScript, a language that computers already know how to run. A plain program becomes
// one file. A program with a server part and a client part becomes two files: one for the
// server (which keeps the secrets) and one for the client (which never gets them), plus the
// small pieces that let the two talk to each other over the network. Lists become arrays,
// enums become fixed strings, and a newtype like Cents becomes a plain number that TypeScript
// still keeps apart from other numbers, so nothing changes shape on the wire.

import { Block, EnumDecl, Expr, Fn, IfExpr, MatchExpr, NewtypeDecl, Program, Stmt, TypeDecl, TypeNode } from './ast.ts';
import { PRELUDE } from './prelude.ts';

type Mode = 'single' | 'server' | 'client';

/** What the compiler writes: `ts` for a one-sided program, `server` and `client` for a two-sided one. */
export interface Emitted { ts?: string; server?: string; client?: string }

const builtins = (side: 'shared' | 'server') =>
  Object.entries(PRELUDE).filter(([, b]) => (b.side ?? 'shared') === side).map(([k, b]) => `  ${k}: ${b.impl},`).join('\n');

const helpers = () => `// Small helper tools that Tensium programs are allowed to use (like parseInt, len, and str).
// They live in this one object so the program's own function names never clash with them.
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
const __ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
const __err = <E>(error: E): { ok: false; error: E } => ({ ok: false, error });
const __tn = {
${builtins('shared')}
};
`;

const SERVER_IMPORTS = `import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

`;

const serverHelpers = () => `// Server-only tools. The compiler never writes these into the client file.
type Secret = string & { readonly __secret: true };
const __srv = {
${builtins('server')}
};
`;

const WIRE_HELPERS = `// A description of each kind of value that may travel between client and server,
// so both ends can check what arrives instead of trusting it.
type __Desc = 'number' | 'string' | 'boolean' | 'void' | { nullable: __Desc } | { list: __Desc } | { enum: string[] } | { result: [__Desc, __Desc] } | { record: { [field: string]: __Desc } };
function __valid(v: unknown, d: __Desc): boolean {
  if (d === 'number') return typeof v === 'number' && Number.isFinite(v);
  if (d === 'string') return typeof v === 'string';
  if (d === 'boolean') return typeof v === 'boolean';
  if (d === 'void') return v === undefined || v === null;
  if ('nullable' in d) return v === null || __valid(v, d.nullable);
  if ('list' in d) return Array.isArray(v) && v.every((x) => __valid(x, d.list));
  if ('enum' in d) return typeof v === 'string' && d.enum.includes(v);
  if (typeof v !== 'object' || v === null) return false;
  const o = v as { [key: string]: unknown };
  if ('result' in d) return o.ok === true ? __valid(o.value, d.result[0]) : o.ok === false && __valid(o.error, d.result[1]);
  const names = Object.keys(d.record);
  return names.every((k) => __valid(o[k], d.record[k])) && Object.keys(o).every((k) => names.includes(k));
}
`;

const CLIENT_PLUMBING = `// ---- Network plumbing, written by the compiler. Call __connect(url) once to say where the server is.
let __endpoint = 'http://127.0.0.1:8787';
export function __connect(url: string): void { __endpoint = url.replace(/\\/$/, ''); }
async function __rpc<T>(name: string, args: unknown[], returns: __Desc): Promise<T> {
  try {
    const res = await fetch(__endpoint + '/rpc/' + name, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) });
    if (!res.ok) return __err('network: HTTP ' + res.status) as T;
    const out: unknown = await res.json();
    return __valid(out, returns) ? (out as T) : (__err('network: unexpected response from ' + name) as T);
  } catch (e) {
    return __err('network: ' + (e instanceof Error ? e.message : String(e))) as T;
  }
}
`;

const serverPlumbing = (routes: string) => `// ---- Network plumbing, written by the compiler. Only the server functions that client code
// calls are reachable, and every argument is checked against its type before the call.
const __routes: { [name: string]: { params: __Desc[]; call: (a: unknown[]) => Promise<unknown> } } = {
${routes}
};
export async function __handle(name: string, args: unknown): Promise<unknown> {
  const route = Object.hasOwn(__routes, name) ? __routes[name] : undefined;
  if (!route) return __err('network: no such server function: ' + name);
  if (!Array.isArray(args) || args.length !== route.params.length || !args.every((a, i) => __valid(a, route.params[i]))) {
    return __err('network: bad arguments for ' + name);
  }
  return route.call(args);
}
/** Starts an HTTP server (port 0 picks a free port). POST /rpc/<name> with a JSON array of arguments. */
export function __serve(port = 0): Promise<{ port: number; url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const m = /^\\/rpc\\/([A-Za-z_$][\\w$]*)$/.exec(req.url ?? '');
    if (req.method !== 'POST' || !m) { res.writeHead(404).end(); return; }
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let args: unknown;
      try { args = JSON.parse(body); } catch { args = undefined; }
      __handle(m[1], args).then(
        (out) => { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out)); },
        () => { res.writeHead(500).end(); },
      );
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const actual = (server.address() as AddressInfo).port;
    resolve({ port: actual, url: 'http://127.0.0.1:' + actual, close: () => new Promise<void>((done) => server.close(() => done())) });
  }));
}
`;

/** The top of every generated file: the .tn file's own explanation, plus a note that this file is machine-written. */
function header(explanation: string[], part = ''): string {
  const own = explanation.map((l) => `// ${l}`.trimEnd()).join('\n');
  return `${own}\n//\n// NOTE: the Tensium compiler wrote this TypeScript file${part} from a .tn file.\n// Change the .tn file instead; edits made here will be lost next time it is compiled.\n\n`;
}

function ty(n: TypeNode): string {
  switch (n.kind) {
    case 'TypeName': return n.name;
    case 'TypeResult': return `Result<${ty(n.ok)}, ${ty(n.err)}>`;
    case 'TypeList': return `Array<${ty(n.elem)}>`;
    case 'TypeNullable': return `${ty(n.inner)} | null`;
  }
}

class Emitter {
  private id = 0;
  private fresh = () => `__m${this.id++}`;
  /** True while writing an async function, where calls across sides are awaited. */
  private isAsync = false;
  private fnsByName: Map<string, Fn>;
  private decls: Map<string, TypeDecl>;
  private enums: Map<string, EnumDecl>;
  private newtypes: Map<string, NewtypeDecl>;

  constructor(private p: Program, private mode: Mode) {
    this.fnsByName = new Map(p.fns.map((f) => [f.name, f]));
    this.decls = new Map(p.types.map((d) => [d.name, d]));
    this.enums = new Map(p.enums.map((d) => [d.name, d]));
    this.newtypes = new Map(p.newtypes.map((d) => [d.name, d]));
  }

  // ---- types
  private nodeHasSecret(n: TypeNode, seen = new Set<string>()): boolean {
    switch (n.kind) {
      case 'TypeResult': return this.nodeHasSecret(n.ok, seen) || this.nodeHasSecret(n.err, seen);
      case 'TypeList': return this.nodeHasSecret(n.elem, seen);
      case 'TypeNullable': return this.nodeHasSecret(n.inner, seen);
      case 'TypeName': {
        if (n.name === 'Secret') return true;
        const d = this.decls.get(n.name);
        if (!d || seen.has(n.name)) return false;
        seen.add(n.name);
        return d.fields.some((f) => this.nodeHasSecret(f.typeNode, seen));
      }
    }
  }

  /** Type declarations this file may contain: the client file never mentions a type that holds a Secret. */
  private visibleTypes(): TypeDecl[] {
    return this.p.types.filter((d) => this.mode !== 'client' || !d.fields.some((f) => this.nodeHasSecret(f.typeNode)));
  }

  typeDecls(): string {
    const enums = this.p.enums.map((d) => `export type ${d.name} = ${d.members.map((m) => JSON.stringify(m.name)).join(' | ')};`);
    // a newtype is the plain value with a type-level tag: the same JSON as the value it wraps
    const newtypes = this.p.newtypes.map((d) => `export type ${d.name} = ${ty(d.typeNode)} & { readonly __tn_${d.name}: true };`);
    const records = this.visibleTypes().map((d) => `export type ${d.name} = { ${d.fields.map((f) => `${f.name}: ${ty(f.typeNode)}`).join('; ')} };`);
    return [...enums, ...newtypes, ...records].join('\n');
  }

  desc(n: TypeNode): string {
    switch (n.kind) {
      case 'TypeResult': return `{ result: [${this.desc(n.ok)}, ${this.desc(n.err)}] }`;
      case 'TypeList': return `{ list: ${this.desc(n.elem)} }`;
      case 'TypeNullable': return `{ nullable: ${this.desc(n.inner)} }`;
      case 'TypeName': {
        if (this.decls.has(n.name)) return `__d_${n.name}`;
        const en = this.enums.get(n.name);
        if (en) return `{ enum: [${en.members.map((m) => JSON.stringify(m.name)).join(', ')}] }`;
        const nt = this.newtypes.get(n.name);
        if (nt) return this.desc(nt.typeNode);
        return `'${n.name}'`;
      }
    }
  }

  /** One description per record type, written so each comes after the types it is built from. */
  descDecls(): string {
    const out: string[] = [];
    const done = new Set<string>();
    const names = (n: TypeNode): string[] => n.kind === 'TypeName' ? [n.name] : n.kind === 'TypeNullable' ? names(n.inner) : n.kind === 'TypeList' ? names(n.elem) : [...names(n.ok), ...names(n.err)];
    const visit = (d: TypeDecl) => {
      if (done.has(d.name) || d.fields.some((f) => this.nodeHasSecret(f.typeNode))) return;
      done.add(d.name);
      for (const f of d.fields) for (const name of names(f.typeNode)) { const dep = this.decls.get(name); if (dep) visit(dep); }
      out.push(`const __d_${d.name}: __Desc = { record: { ${d.fields.map((f) => `${f.name}: ${this.desc(f.typeNode)}`).join(', ')} } };`);
    };
    this.p.types.forEach(visit);
    return out.join('\n');
  }

  // ---- functions
  fn(f: Fn): string {
    this.isAsync = this.mode !== 'single' && f.side !== 'shared';
    const params = f.params.map((p) => `${p.name}: ${ty(p.typeNode!)}`).join(', ');
    const ret = ty(f.retNode!);
    const body = this.stmts(f.body.stmts, '  ');
    return `export ${this.isAsync ? 'async ' : ''}function ${f.name}(${params}): ${this.isAsync ? `Promise<${ret}>` : ret} {\n${body}\n}`;
  }

  fns(sides: Fn['side'][]): string {
    return this.p.fns.filter((f) => sides.includes(f.side)).map((f) => this.fn(f)).join('\n\n');
  }

  routes(boundary: string[]): string {
    return boundary.map((name) => {
      const f = this.fnsByName.get(name)!;
      const args = f.params.map((p, i) => `a[${i}] as ${ty(p.typeNode!)}`).join(', ');
      return `  ${name}: { params: [${f.params.map((p) => this.desc(p.typeNode!)).join(', ')}], call: (a) => ${name}(${args}) },`;
    }).join('\n');
  }

  /** A function body used as a value. In an async function it must be awaited so the calls inside it can wait too. */
  private iife(inner: string): string {
    return this.isAsync ? `(await (async () => {${inner}})())` : `(() => {${inner}})()`;
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
      case 'Let': return `${ind}${s.mut ? 'let' : 'const'} ${s.name}${s.typeNode ? `: ${ty(s.typeNode)}` : ''} = ${this.expr(s.init, ind)};`;
      case 'Assign': return `${ind}${s.name} = ${this.expr(s.expr, ind)};`;
      case 'For': return `${ind}for (const ${s.name} of ${this.expr(s.iter, ind)}) {\n${this.stmtBlock(s.body, ind + '  ')}\n${ind}}`;
      case 'While': return `${ind}while (${this.expr(s.cond, ind)}) {\n${this.stmtBlock(s.body, ind + '  ')}\n${ind}}`;
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

  private isResultMatch(e: MatchExpr): boolean { return e.arms.some((a) => a.pat === 'ok' || a.pat === 'err'); }

  matchStmt(e: MatchExpr, ind: string): string {
    const m = this.fresh();
    if (!this.isResultMatch(e)) {
      // an enum: one branch per member; the checker made sure every member has exactly one arm
      const branches = e.arms.map((a, i) => `${i === 0 ? '' : ' else '}${i === e.arms.length - 1 ? '' : `if (${m} === ${JSON.stringify(a.pat)}) `}{\n${this.stmtBlock(a.body, ind + '    ')}\n${ind}  }`).join('');
      return `${ind}{\n${ind}  const ${m} = ${this.expr(e.scrut, ind)};\n${ind}  ${branches}\n${ind}}`;
    }
    const arm = (pat: string) => e.arms.find((a) => a.pat === pat)!;
    const ok = arm('ok'), er = arm('err');
    return `${ind}{\n${ind}  const ${m} = ${this.expr(e.scrut, ind)};\n` +
      `${ind}  if (${m}.ok) {\n${ind}    const ${ok.bind} = ${m}.value;\n${this.stmtBlock(ok.body, ind + '    ')}\n${ind}  } else {\n` +
      `${ind}    const ${er.bind} = ${m}.error;\n${this.stmtBlock(er.body, ind + '    ')}\n${ind}  }\n${ind}}`;
  }

  /** A block in value position: an expression that evaluates to the tail. */
  valueBlock(b: Block, ind: string): string {
    if (b.stmts.length === 0 && b.tail) return `(${this.expr(b.tail, ind)})`;
    return this.iife(`\n${this.stmts(b.stmts, ind + '  ')}\n${ind}  return ${b.tail ? this.expr(b.tail, ind + '  ') : 'undefined'};\n${ind}`);
  }

  call(e: Extract<Expr, { kind: 'Call' }>, ind: string): string {
    const args = e.args.map((a) => this.expr(a, ind)).join(', ');
    if (e.name === 'ok') return `__ok(${args})`;
    if (e.name === 'err') return `__err(${args})`;
    if (this.newtypes.has(e.name)) return `(${args} as ${e.name})`;
    const target = this.fnsByName.get(e.name);
    if (!target) return `${PRELUDE[e.name]?.side === 'server' ? '__srv' : '__tn'}.${e.name}(${args})`;
    if (target.side === 'shared' || this.mode === 'single') return `${e.name}(${args})`;
    // a client fn calling a server fn crosses the network; every other sided call is a local async call
    if (this.mode === 'client' && target.side === 'server') {
      return `(await __rpc<${ty(target.retNode!)}>(${JSON.stringify(e.name)}, [${args}], ${this.desc(target.retNode!)}))`;
    }
    return `(await ${e.name}(${args}))`;
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
      case 'Call': return this.call(e, ind);
      case 'Field': return `${this.expr(e.obj, ind)}.${e.name}`;
      case 'List': return `[${e.items.map((x) => this.expr(x, ind)).join(', ')}]`;
      case 'EnumVal': return JSON.stringify(e.member);
      case 'Unwrap': return `(${this.expr(e.expr, ind)} as ${e.inner})`;
      case 'Record': {
        const fields = e.fields.map((f) => `${f.name}: ${this.expr(f.value, ind)}`);
        return `({ ${[...(e.spread ? [`...${this.expr(e.spread, ind)}`] : []), ...fields].join(', ')} })`;
      }
      case 'If': {
        const els = e.else!;
        const elseCode = els.kind === 'If' ? this.expr(els, ind) : this.valueBlock(els, ind);
        return `(${this.expr(e.cond, ind)} ? ${this.valueBlock(e.then, ind)} : ${elseCode})`;
      }
      case 'Match': {
        const m = this.fresh();
        if (!this.isResultMatch(e)) {
          const branches = e.arms.map((a, i) => `${ind}  ${i === e.arms.length - 1 ? '' : `if (${m} === ${JSON.stringify(a.pat)}) `}{ return ${this.valueBlock(a.body, ind + '  ')}; }\n`).join('');
          return this.iife(`\n${ind}  const ${m} = ${this.expr(e.scrut, ind)};\n${branches}${ind}`);
        }
        const ok = e.arms.find((a) => a.pat === 'ok')!, er = e.arms.find((a) => a.pat === 'err')!;
        return this.iife(`\n${ind}  const ${m} = ${this.expr(e.scrut, ind)};\n` +
          `${ind}  if (${m}.ok) { const ${ok.bind} = ${m}.value; return ${this.valueBlock(ok.body, ind + '  ')}; }\n` +
          `${ind}  else { const ${er.bind} = ${m}.error; return ${this.valueBlock(er.body, ind + '  ')}; }\n${ind}`);
      }
    }
  }
}

const join = (...parts: string[]) => parts.filter((s) => s.trim() !== '').map((s) => s.trimEnd()).join('\n\n') + '\n';

/**
 * Writes the TypeScript. `boundary` lists the server fns that client code calls;
 * only those become reachable over the network.
 */
export function emit(p: Program, explanation: string[] = [], boundary: string[] = []): Emitted {
  if (!p.fns.some((f) => f.side !== 'shared')) {
    const e = new Emitter(p, 'single');
    return { ts: join(header(explanation) + helpers(), e.typeDecls(), e.fns(['shared'])) };
  }
  const s = new Emitter(p, 'server');
  const c = new Emitter(p, 'client');
  return {
    server: join(
      header(explanation, ' (the SERVER half)') + SERVER_IMPORTS + helpers(), serverHelpers(), WIRE_HELPERS,
      s.typeDecls(), s.descDecls(), s.fns(['shared', 'server']), serverPlumbing(s.routes(boundary)),
    ),
    client: join(
      header(explanation, ' (the CLIENT half)') + helpers(), WIRE_HELPERS,
      c.typeDecls(), c.descDecls(), CLIENT_PLUMBING, c.fns(['shared', 'client']),
    ),
  };
}
