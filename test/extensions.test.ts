// This file is the practice quiz for the newer parts of the language: lists and loops,
// bindings that may change ("let mut"), enums with a fixed set of names, newtypes that keep a
// Cents apart from a plain number, and copying a record with a few changes. It checks that the
// right mistakes are reported and that the TypeScript the compiler writes gives the right answers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyFixes } from '../src/fix.ts';
import { compile } from '../src/index.ts';

const H = '// A tiny test program used to check the rules of the language.\n';
const diags = (src: string) => compile(H + src).diagnostics;
const codes = (src: string) => diags(src).map((d) => d.code);

/** Runs a one-sided program's TypeScript and returns what `main()` printed as JSON. */
function run(src: string): unknown {
  const r = compile(H + src);
  assert.deepEqual(r.diagnostics, [], 'program should compile cleanly');
  const dir = mkdtempSync(join(tmpdir(), 'tn-ext-'));
  writeFileSync(join(dir, 'prog.ts'), r.ts!);
  writeFileSync(join(dir, 'run.mts'), `import { main } from './prog.ts';\nconsole.log(JSON.stringify(main()));\n`);
  const out = execFileSync('npx', ['tsx', join(dir, 'run.mts')], { cwd: process.cwd(), encoding: 'utf8' });
  return JSON.parse(out.trim());
}

test('lists: literals, loops, builtins and mutable accumulators run correctly', () => {
  assert.deepEqual(run(`fn main(): string {
  let xs = [3, 1, 2];
  let mut total = 0;
  for (x in xs) { total = total + x; }
  let mut names: List<string> = [];
  for (i in range(0, len(xs))) { names = push(names, str(i)); }
  let first = get(xs, 0);
  let missing = get(xs, 9);
  let firstText = if (first !== null) { str(first) } else { "none" };
  let missingText = if (missing === null) { "none" } else { "some" };
  return str(total) + " " + join(names, ",") + " " + firstText + " " + missingText + " " + str(len(concat(xs, [4]))) + " " + (if (has(xs, 2)) { "y" } else { "n" });
}`), '6 0,1,2 3 none 4 y');
});

test('lists: type errors are reported and indexing is corrected', () => {
  assert.deepEqual(codes('fn f(): number { let xs = [1, "a"]; return len(xs); }'), ['TN0002']);
  assert.deepEqual(codes('fn f(xs: List<number>): number { return xs[0] + 1; }'), ['TN0003', 'TN3002']);
  assert.deepEqual(codes('fn f(n: number): number { for (x in n) { return x; } return 0; }'), ['TN0002']);
  assert.deepEqual(codes('fn f(): number { let xs = []; return len(xs); }'), ['TN3001']);
  assert.deepEqual(codes('fn f(xs: List<number>): number { push(xs, 1); return len(xs); }'), ['TN1002']);
  const [d] = diags('fn f(xs: number[]): number { return len(xs); }');
  assert.equal(d.code, 'TN0003');
  assert.equal(d.suggestedFix!.edit!.newText, 'List<number>');
});

test('TN0012: only let mut bindings can be assigned; the fix inserts mut', () => {
  const src = H + 'fn f(): number { let n = 1; n = 2; return n; }';
  const r = compile(src);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ['TN0012']);
  assert.equal(applyFixes(src).ok, true);
  assert.deepEqual(codes('fn f(n: number): number { n = 2; return n; }'), ['TN0012']);
  assert.deepEqual(codes('type P = { x: number }\nfn f(p: P): number { p.x = 2; return p.x; }'), ['TN0012']);
  assert.deepEqual(codes('fn f(): number { let mut n = 1; n = "a"; return n; }'), ['TN0002']);
  assert.deepEqual(codes('fn f(): number { let mut n = 1; while (n < 10) { n = n * 2; } return n; }'), []);
});

test('enums: values, exhaustive match as statement and as value, and the generated code', () => {
  const E = 'enum Status { Draft, Sent, Paid }\n';
  assert.deepEqual(codes(E + 'fn f(s: Status): number { return match s { Draft => 1, Sent => 2, Paid => 3 }; }'), []);
  assert.deepEqual(codes(E + 'fn f(s: Status): number { return match s { Draft => 1, Sent => 2 }; }'), ['TN2001']);
  assert.deepEqual(codes(E + 'fn f(s: Status): number { return match s { Draft => 1, Sent => 2, Paid => 3, Paid => 4 }; }'), ['TN2002']);
  assert.deepEqual(codes(E + 'fn f(s: Status): number { return match s { Draft => 1, Sent => 2, Payed => 3 }; }'), ['TN2001', 'TN2003']);
  assert.deepEqual(codes(E + 'fn f(s: Status): number { return match s { Draft(x) => 1, Sent => 2, Paid => 3 }; }'), ['TN2003']);
  assert.deepEqual(codes(E + 'fn f(): Status { return Status.Payed; }'), ['TN2003']);
  assert.deepEqual(codes(E + 'fn f(): Status { return "Draft"; }'), ['TN0002']);
  assert.deepEqual(codes(E + 'fn f(): Status { return Status; }'), ['TN0004']);
  assert.deepEqual(codes(E + 'fn f(s: Status): boolean { return s == Status.Paid; }'), []);
  // the statement form gets a mechanical fix that adds every missing arm
  const src = H + E + 'fn f(s: Status): number {\n  match s {\n    Draft => { return 1; }\n  }\n  return 0;\n}';
  assert.equal(applyFixes(src).ok, true);
  assert.deepEqual(run(E + `fn label(s: Status): string { return match s { Draft => "d", Sent => "s", Paid => "p" }; }
fn main(): string {
  let mut out = "";
  for (s in [Status.Paid, Status.Draft, Status.Sent]) {
    match s {
      Draft => { out = out + label(s); }
      Sent => { out = out + "S"; }
      Paid => { out = out + "P"; }
    }
  }
  return out;
}`), 'PdS');
});

test('newtypes: a Cents is never a number, in either direction, with fixes both ways', () => {
  const N = 'newtype Cents = number;\nnewtype CustomerId = number;\n';
  assert.deepEqual(codes(N + 'fn f(c: Cents): number { return c + 1; }'), ['TN0002']);
  const [d] = diags(N + 'fn f(c: Cents): number { return c + 1; }');
  assert.equal(d.suggestedFix!.edit!.newText, 'c.value');
  const [w] = diags(N + 'fn f(n: number): Cents { return n; }');
  assert.equal(w.code, 'TN0002');
  assert.equal(w.suggestedFix!.edit!.newText, 'Cents(n)');
  assert.deepEqual(codes(N + 'fn f(c: Cents): CustomerId { return c; }'), ['TN0002']);
  assert.deepEqual(codes(N + 'fn f(c: Cents): number { return c.amount; }'), ['TN0002']);
  assert.deepEqual(codes(N + 'fn f(c: Cents): boolean { return c == 5; }'), ['TN0002']);
  assert.deepEqual(codes(N + 'fn f(c: Cents, d: Cents): boolean { return c == d; }'), []);
  assert.deepEqual(codes(N + 'fn f(c: Cents): Cents { return Cents(c); }'), ['TN0002']);
  assert.deepEqual(codes('newtype Bad = Result<number, string>;\nfn f(): number { return 1; }'), ['TN0011']);
  assert.deepEqual(codes(N + 'fn f(n: number): Cents { return Cents(n); }\nfn g(c: Cents): number { return c.value * 2; }'), []);
  assert.equal(run(N + 'type Line = { price: Cents, qty: number }\nfn total(l: Line): Cents { return Cents(l.price.value * l.qty); }\nfn main(): number { return total({ price: Cents(250), qty: 3 }).value; }'), 750);
});

test('record spread: a copy with changes keeps the type and rejects unknown or mistyped fields', () => {
  const U = 'type User = { id: number, name: string, email: string | null }\n';
  assert.deepEqual(codes(U + 'fn f(u: User): User { return { ...u, name: "Bo" }; }'), []);
  assert.deepEqual(codes(U + 'fn f(u: User): User { return { ...u, nmae: "Bo" }; }'), ['TN5005']);
  assert.deepEqual(codes(U + 'fn f(u: User): User { return { ...u, id: "1" }; }'), ['TN0002']);
  assert.deepEqual(codes(U + 'fn f(u: User | null): User { return { ...u, name: "Bo" }; }'), ['TN3002']);
  assert.deepEqual(codes(U + 'fn f(n: number): number { let x = { ...n, a: 1 }; return 1; }'), ['TN0002']);
  assert.deepEqual(run(U + 'fn main(): string { let u: User = { id: 1, name: "Ann", email: null }; let v = { ...u, name: "Bo" }; return u.name + v.name + str(v.id); }'), 'AnnBo1');
});

test('two-sided programs carry lists, enums and newtypes across the wire and validate them', () => {
  const src = H + `enum Tier { Basic, Gold }
newtype Cents = number;
type Item = { name: string, price: Cents, tags: List<string>, tier: Tier }
server fn items(): Result<List<Item>, string> {
  return ok([{ name: "a", price: Cents(100), tags: ["x", "y"], tier: Tier.Gold }, { name: "b", price: Cents(5), tags: [], tier: Tier.Basic }]);
}
client fn summary(): string {
  match items() {
    ok(xs) => {
      let mut out = "";
      for (i in xs) { out = out + i.name + ":" + str(i.price.value) + ":" + join(i.tags, "+") + ":" + (match i.tier { Basic => "b", Gold => "g" }) + " "; }
      return trim(out);
    }
    err(e) => { return "error: " + e; }
  }
}`;
  const r = compile(src);
  assert.deepEqual(r.diagnostics, []);
  assert.match(r.server!, /export type Tier = "Basic" \| "Gold";/);
  assert.match(r.server!, /export type Cents = number & \{ readonly __tn_Cents: true \};/);
  assert.match(r.client!, /\{ list: __d_Item \}/);
  assert.match(r.client!, /\{ enum: \["Basic", "Gold"\] \}/);
  const dir = mkdtempSync(join(tmpdir(), 'tn-wire-'));
  writeFileSync(join(dir, 'server.ts'), r.server!);
  writeFileSync(join(dir, 'client.ts'), r.client!);
  writeFileSync(join(dir, 'run.mts'), `import { __serve } from './server.ts';
import { __connect, summary } from './client.ts';
const s = await __serve(0);
__connect(s.url);
console.log(JSON.stringify(await summary()));
await s.close();
`);
  const out = execFileSync('npx', ['tsx', join(dir, 'run.mts')], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(JSON.parse(out.trim()), 'a:100:x+y:g b:5::b');
});
