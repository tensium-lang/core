// This file is the compiler's practice quiz. For every kind of mistake the checker knows,
// it feeds in a small broken program and makes sure the right error shows up. It also checks
// that good programs pass, that suggested fixes really fix things, that the top-comment rule
// works, and that the TypeScript the compiler writes is valid and gives the right answers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '../src/index.ts';

// Every .tn file needs a plain-words header (rule TN4001/TN4002), so test programs get one.
const H = '// A tiny test program used to check the rules of the language.\n';
const codes = (src: string) => compile(H + src).diagnostics.map((d) => d.code);
const wrap = (body: string, sig = 'fn f(s: string): Result<number, string>') => `${sig} {\n${body}\n}`;

const cases: Record<string, string> = {
  TN0001: 'fn f(): number { return 1 +; }',
  TN0002: 'fn f(): number { return "x"; }',
  TN0003: 'function f(): number { return 1; }',
  TN0004: 'fn f(): number { return y; }',
  TN0005: 'fn f(): number { return len("a", "b"); }',
  TN0006: 'fn f(x: boolean): number { if (x) { return 1; } }',
  TN0007: 'fn f(): number { return 1; }\nfn f(): number { return 2; }',
  TN0008: 'fn f(x: boolean): number { return if (x) { 1 }; }',
  TN0009: 'fn f(): number { 1 + 2 }',
  TN0010: 'fn f(r: Result<number, string>): number { return match r { ok(n) => { return n; }, err(e) => 0 }; }',
  TN1001: 'fn f(): number { throw "x"; }',
  TN1002: wrap('parseInt(s);\nreturn ok(1);'),
  TN1003: 'fn f(s: string): number { return parseInt(s) + 1; }',
  TN1004: 'fn f(): number { try { return 1; } catch (e) { return 2; } }',
  TN2001: 'fn f(r: Result<number, string>): number { return match r { ok(n) => n }; }',
  TN2002: 'fn f(r: Result<number, string>): number { return match r { ok(n) => n, ok(m) => m, err(e) => 0 }; }',
  TN2003: 'fn f(r: Result<number, string>): number { return match r { Ok(n) => n, err(e) => 0 }; }',
  TN2004: 'fn f(x: number): number { return match x { ok(n) => n, err(e) => 0 }; }',
  TN3001: 'fn f(x): number { return 1; }',
  TN3002: 'fn f(x: number | null): number { return x + 1; }',
};

for (const [code, src] of Object.entries(cases)) {
  test(`reports ${code}`, () => {
    const r = compile(H + src);
    assert.ok(r.diagnostics.some((d) => d.code === code), `expected ${code}, got ${JSON.stringify(codes(src))}`);
  });
}

test('diagnostic shape', () => {
  const [d] = compile(H + 'fn f(): number { return "x"; }', 'a.tn').diagnostics;
  assert.deepEqual(Object.keys(d).sort(), ['actual', 'code', 'expected', 'message', 'severity', 'span', 'suggestedFix']);
  assert.deepEqual(d.span, { file: 'a.tn', startLine: 2, startCol: 25, endLine: 2, endCol: 28 });
  assert.equal(d.expected, 'number');
  assert.equal(d.actual, 'string');
});

test('null narrowing: guard, early return, and &&', () => {
  assert.deepEqual(codes('fn f(x: number | null): number { if (x !== null) { return x + 1; } return 0; }'), []);
  assert.deepEqual(codes('fn f(x: number | null): number { if (x === null) { return 0; } return x + 1; }'), []);
  assert.deepEqual(codes('fn f(x: number | null): boolean { return x !== null && x > 1; }'), []);
  assert.deepEqual(codes('fn f(x: number | null): number { if (x === null) { return 0; } else { return x; } }'), []);
});

test('valid programs: both Result cases handled', () => {
  assert.deepEqual(codes(wrap('let r = parseInt(s);\nreturn match r { ok(n) => ok(n * 2), err(e) => err(e) };')), []);
  assert.deepEqual(codes(wrap('match parseInt(s) { ok(n) => {} err(e) => { return err(e); } }\nreturn ok(1);')), []);
});

test('ignoring a let-bound Result is an error', () => {
  assert.ok(codes(wrap('let r = parseInt(s);\nreturn ok(1);')).includes('TN1002'));
});

test('suggested fixes are mechanically applicable', () => {
  const src = H + 'fn f(r: Result<number, string>): Result<number, string> {\n  return match r {\n    ok(n) => ok(n),\n  };\n}\n';
  const d = compile(src).diagnostics.find((x) => x.code === 'TN2001')!;
  const e = d.suggestedFix!.edit!;
  const off = (line: number, col: number) => src.split('\n').slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0) + col - 1;
  const fixed = src.slice(0, off(e.span.startLine, e.span.startCol)) + e.newText + src.slice(off(e.span.endLine, e.span.endCol));
  assert.deepEqual(codes(fixed), []);
});

test('emitted TypeScript is valid under tsc --strict and runs', () => {
  const r = compile(readFileSync('examples/good.tn', 'utf8'), 'good.tn');
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const dir = mkdtempSync(join(tmpdir(), 'tn-'));
  const file = join(dir, 'good.ts');
  writeFileSync(file, r.ts!);
  execFileSync(join(process.cwd(), 'node_modules/.bin/tsc'), ['--noEmit', '--strict', '--target', 'es2022', 'good.ts'], { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'run.ts'), `import * as m from './good.ts'; console.log(JSON.stringify([m.parseAge("42"), m.parseAge("-3"), m.parseAge("x"), m.describe("7"), m.upperFirst("abc"), m.upperFirst("")]));`);
  const out = execFileSync('npx', ['tsx', join(dir, 'run.ts')]).toString().trim();
  assert.equal(out, JSON.stringify([{ ok: true, value: 42 }, { ok: false, error: 'negative' }, { ok: false, error: 'not an integer: x' }, 'age 7', 'A', '']));
});

test('TN4001: a file with no top comment is rejected, and the suggested fix is a placeholder that still fails', () => {
  const src = 'fn f(): number { return 1; }\n';
  const d = compile(src).diagnostics.find((x) => x.code === 'TN4001')!;
  assert.ok(d, 'expected TN4001');
  assert.deepEqual(d.span, { file: 'input.tn', startLine: 1, startCol: 1, endLine: 1, endCol: 1 });
  const fixed = d.suggestedFix!.edit!.newText + src;
  assert.deepEqual(compile(fixed).diagnostics.map((x) => x.code), ['TN4002']); // the TODO must still be replaced
});

test('TN4001: an empty file is rejected', () => {
  assert.ok(compile('').diagnostics.some((d) => d.code === 'TN4001'));
});

test('TN4002: a too-short or TODO header is rejected; a real one passes', () => {
  assert.ok(compile('// hi\nfn f(): number { return 1; }').diagnostics.some((d) => d.code === 'TN4002'));
  assert.ok(compile('// TODO write this later when there is time\nfn f(): number { return 1; }').diagnostics.some((d) => d.code === 'TN4002'));
  assert.deepEqual(compile('// This file has one function that always gives back the number one.\nfn f(): number { return 1; }').diagnostics, []);
  assert.deepEqual(compile('/* This file has one function\n   that always gives back the number one. */\nfn f(): number { return 1; }').diagnostics, []);
});

test('the header is carried into the emitted TypeScript', () => {
  const r = compile('// This file has one function that always gives back the number one.\nfn f(): number { return 1; }');
  assert.ok(r.ts!.startsWith('// This file has one function that always gives back the number one.\n'));
});

test('TN0010: a return inside a value arm reports once, without follow-on type errors', () => {
  const src = H + `fn f(a: string, b: string): Result<number, string> {
  return match parseInt(a) {
    ok(x) => {
      return match parseInt(b) {
        ok(y) => ok(x + y),
        err(e) => err("bad b"),
      };
    },
    err(e) => err("bad a"),
  };
}`;
  assert.deepEqual(compile(src).diagnostics.map((d) => d.code), ['TN0010']);
});

test('TN0010: the suggested edit removes the return and the semicolon, and the result compiles', () => {
  const src = H + `fn f(a: string, b: string): Result<number, string> {
  return match parseInt(a) {
    ok(x) => {
      return match parseInt(b) {
        ok(y) => ok(x + y),
        err(e) => err("bad b"),
      };
    },
    err(e) => err("bad a"),
  };
}
`;
  const d = compile(src).diagnostics[0];
  assert.equal(d.code, 'TN0010');
  assert.equal(d.expected !== null && d.actual !== null, true);
  const e = d.suggestedFix!.edit!;
  assert.ok(src.slice(offsetOf(src, e.span.startLine, e.span.startCol), offsetOf(src, e.span.endLine, e.span.endCol)).endsWith(';'), 'span includes the semicolon');
  const fixed = applyEdit(src, e);
  assert.deepEqual(compile(fixed).diagnostics, []);
});

test('TN1001: the suggested edit does not leave a double semicolon', () => {
  const src = H + 'fn f(x: number): Result<number, string> {\n  if (x < 0) { throw "neg"; }\n  return ok(x);\n}\n';
  const d = compile(src).diagnostics.find((x) => x.code === 'TN1001')!;
  const fixed = applyEdit(src, d.suggestedFix!.edit!);
  assert.ok(!fixed.includes(';;'));
  assert.deepEqual(compile(fixed).diagnostics, []);
});

function offsetOf(src: string, line: number, col: number): number {
  return src.split('\n').slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0) + col - 1;
}
function applyEdit(src: string, e: { span: { startLine: number; startCol: number; endLine: number; endCol: number }; newText: string }): string {
  return src.slice(0, offsetOf(src, e.span.startLine, e.span.startCol)) + e.newText + src.slice(offsetOf(src, e.span.endLine, e.span.endCol));
}
