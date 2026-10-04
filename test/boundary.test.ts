// This file is the practice quiz for the client/server part of the language. It checks that
// records work, that both sides must agree on every field, that secrets cannot leave the
// server, and that the two TypeScript files the compiler writes really talk to each other
// over the network and give the right answers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyFixes } from '../src/fix.ts';
import { compile } from '../src/index.ts';

const H = '// A tiny test program used to check the rules of the language.\n';
const diags = (src: string) => compile(H + src).diagnostics;
const codes = (src: string) => diags(src).map((d) => d.code);
const shop = readFileSync('examples/shop.tn', 'utf8');

const USER = 'type User = { id: number, name: string, email: string | null }\n';

test('records: literals, field access and nested records type-check', () => {
  assert.deepEqual(codes(USER + `type Pair = { a: User, b: User }
fn mk(id: number): User { return { id: id, name: "x", email: null }; }
fn short(id: number, name: string): User { return { id, name, email: "e" }; }
fn first(p: Pair): string { return p.a.name; }
fn viaLet(): number { let u: User = mk(1); return u.id; }`), []);
});

test('TN5004: unknown field, with a rename suggestion when there is one obvious candidate', () => {
  const [d] = diags(USER + 'fn f(u: User): string { return u.nmae; }');
  assert.equal(d.code, 'TN5004');
  assert.equal(d.suggestedFix!.edit!.newText, 'name');
  const [r] = diags('type C = { id: number, fullName: string }\nfn f(c: C): string { return c.name; }');
  assert.equal(r.code, 'TN5004');
  assert.equal(r.suggestedFix!.edit!.newText, 'fullName');
  // two plausible targets: no guess
  const [a] = diags('type C = { firstName: string, lastName: string }\nfn f(c: C): string { return c.name; }');
  assert.equal(a.code, 'TN5004');
  assert.equal(a.suggestedFix!.edit, undefined);
});

test('TN5005: record values report the exact missing, extra and mistyped fields', () => {
  const ds = diags(USER + 'fn f(): User { return { id: "1", nmae: "x" }; }');
  assert.deepEqual(ds.map((d) => d.code).sort(), ['TN0002', 'TN5005', 'TN5005']);
  assert.ok(ds.some((d) => d.code === 'TN5005' && d.suggestedFix?.edit?.newText === 'name'));
  assert.ok(ds.some((d) => d.code === 'TN5005' && /'email' is missing/.test(d.message)));
  assert.ok(ds.some((d) => d.code === 'TN0002' && d.expected === 'number' && d.actual === 'string'));
  // the report reaches inside ok(...)
  assert.deepEqual(codes(USER + 'fn g(): Result<User, string> { return ok({ id: 1, name: "x" }); }'), ['TN5005']);
});

test('records: null fields must be checked, and string.length points at len()', () => {
  assert.deepEqual(codes(USER + 'fn f(u: User): number { return len(u.email); }'), ['TN3002']);
  assert.deepEqual(codes(USER + 'fn f(u: User): number { let e = u.email; if (e === null) { return 0; } return len(e); }'), []);
  assert.deepEqual(codes(USER + 'fn f(u: User | null): number { return u.id; }'), ['TN3002']);
  const [d] = diags('fn f(s: string): number { return s.length; }');
  assert.equal(d.code, 'TN0002');
  assert.equal(d.suggestedFix!.edit!.newText, 'len(s)');
});

test('type declarations: interface is corrected, recursion and duplicates are rejected', () => {
  const src = H + 'interface P { x: number; y: number }\nfn f(p: P): number { return p.x; }\n';
  assert.deepEqual(compile(src).diagnostics.map((d) => d.code), ['TN0003']);
  assert.equal(applyFixes(src).ok, true);
  assert.ok(codes('type A = { next: A | null }\nfn f(): number { return 1; }').includes('TN0011'));
  assert.ok(codes('type A = { x: number }\ntype A = { y: number }\nfn f(): number { return 1; }').includes('TN0007'));
  const [d] = diags(USER + 'fn f(u: Usr): number { return 1; }');
  assert.equal(d.suggestedFix!.edit!.newText, 'User');
});

test('a one-sided program with records still compiles to a single file', () => {
  const r = compile(H + USER + 'fn f(): User { return { id: 1, name: "a", email: null }; }');
  assert.equal(r.ok, true);
  assert.equal(r.sided, false);
  assert.ok(r.ts!.includes('export type User = { id: number; name: string; email: string | null };'));
});

test('drift: renaming a field in the shared type flags every stale use on BOTH sides, and tn fix repairs them', () => {
  const renamed = shop.replace('type Customer = { id: number, name: string,', 'type Customer = { id: number, fullName: string,');
  assert.notEqual(renamed, shop);
  const ds = compile(renamed, 'shop.tn').diagnostics;
  // 3 server-side record values + 3 client-side reads (greeting, contactLine, receiptText)
  assert.deepEqual(ds.map((d) => d.code).sort(), ['TN5004', 'TN5004', 'TN5004', 'TN5005', 'TN5005', 'TN5005']);
  assert.ok(ds.every((d) => d.suggestedFix?.edit?.newText === 'fullName'));
  const fixed = applyFixes(renamed, 'shop.tn');
  assert.equal(fixed.ok, true);
  assert.equal(fixed.applied, 6);
});

test('TN5001: secrets and server-only builtins cannot be used outside a server fn', () => {
  const client = diags('client fn f(): string { let k = secret("K"); return "x"; }');
  assert.deepEqual(client.map((d) => d.code), ['TN5001']);
  const shared = H + 'fn f(m: string): string { return sign(secret("K"), m); }\n';
  assert.deepEqual(compile(shared).diagnostics.map((d) => d.code), ['TN5001', 'TN5001']);
  assert.equal(applyFixes(shared).source, H + 'server fn f(m: string): string { return sign(secret("K"), m); }\n');
  assert.deepEqual(codes('client fn f(k: Secret): string { return "x"; }'), ['TN5001']);
  assert.deepEqual(codes('type Vault = { key: Secret }\nclient fn f(v: Vault): string { return "x"; }'), ['TN5001']);
});

test('TN5002: a server fn that the client calls cannot take or return a Secret', () => {
  assert.deepEqual(codes(`server fn key(): Result<Secret, string> { return ok(secret("K")); }
client fn f(): string { return match key() { ok(k) => "got it", err(e) => e }; }`), ['TN5002']);
  // the same server fn is fine while only server code calls it
  assert.deepEqual(codes(`server fn key(): Secret { return secret("K"); }
server fn tag(m: string): Result<string, string> { return ok(sign(key(), m)); }
client fn f(m: string): string { return match tag(m) { ok(s) => s, err(e) => e }; }`), []);
});

test('TN5003: server and shared code cannot call client code', () => {
  assert.deepEqual(codes('client fn show(): string { return "x"; }\nserver fn f(): string { return show(); }'), ['TN5003']);
  const shared = H + 'client fn show(): string { return "x"; }\nfn f(): string { return show(); }\n';
  assert.deepEqual(compile(shared).diagnostics.map((d) => d.code), ['TN5003']);
  assert.ok(applyFixes(shared).source.includes('client fn f(): string'));
  assert.deepEqual(codes('server fn s(): Result<number, string> { return ok(1); }\nfn f(): number { return 1; }\nfn g(): Result<number, string> { return s(); }'), ['TN5003']);
});

test('TN5006: a server fn called from the client must return Result<T, string>', () => {
  const src = H + 'server fn price(id: number): number { return 5; }\nclient fn show(id: number): number { return match price(id) { ok(n) => n, err(e) => 0 }; }\n';
  const first = compile(src).diagnostics;
  assert.ok(first.some((d) => d.code === 'TN5006' && d.suggestedFix?.edit?.newText === 'Result<number, string>'));
  // return type edit, then the "wrap in ok(...)" edit: fully mechanical
  const fixed = applyFixes(src);
  assert.equal(fixed.ok, true);
  assert.ok(fixed.source.includes('server fn price(id: number): Result<number, string> { return ok(5); }'));
  assert.deepEqual(codes('server fn p(): Result<number, number> { return ok(1); }\nclient fn c(): number { return match p() { ok(n) => n, err(e) => e }; }'), ['TN5006']);
});

test('the client file never contains server code, server data or secret names', () => {
  const r = compile(shop, 'shop.tn');
  assert.equal(r.ok, true);
  assert.equal(r.sided, true);
  assert.equal(r.ts, undefined);
  for (const leak of ['SIGNING_KEY', 'process.env', 'createHmac', '__srv', 'no such product', 'ann@example.com', 'discountFor(customer']) {
    assert.ok(!r.client!.includes(leak), `client file must not contain ${leak}`);
    assert.ok(r.server!.includes(leak) || leak === 'discountFor(customer', `server file should contain ${leak}`);
  }
  // only the server fns that client code calls are reachable over the network
  const routes = /const __routes: .*= \{\n([\s\S]*?)\n\};/.exec(r.server!)![1];
  assert.deepEqual([...routes.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]).sort(), ['checkout', 'getCustomer', 'getProduct', 'getQuote']);
});

test('the two emitted files pass tsc --strict and work together over real HTTP', () => {
  const r = compile(shop, 'shop.tn');
  const dir = mkdtempSync(join(tmpdir(), 'tn-shop-'));
  writeFileSync(join(dir, 'server.ts'), r.server!);
  writeFileSync(join(dir, 'client.ts'), r.client!);
  execFileSync(join(process.cwd(), 'node_modules/.bin/tsc'), [
    '--noEmit', '--strict', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', '--skipLibCheck',
    '--typeRoots', join(process.cwd(), 'node_modules/@types'), '--types', 'node', join(dir, 'server.ts'), join(dir, 'client.ts'),
  ], { stdio: 'pipe' });
  writeFileSync(join(dir, 'run.mts'), `
import * as server from './server.ts';
import * as client from './client.ts';
const s = await server.__serve(0);
client.__connect(s.url);
const raw = async (name: string, args: unknown) => (await fetch(s.url + '/rpc/' + name, { method: 'POST', body: JSON.stringify(args) })).json();
const out = {
  labels: [await client.productLabel(1), await client.productLabel(2), await client.productLabel(9)],
  canBuy: [await client.canBuy(1), await client.canBuy(2)],
  greeting: await client.greeting(1),
  quotes: [await client.quoteSummary(1, 2, 1), await client.quoteSummary(3, 3, 3), await client.quoteSummary(2, 1, 1)],
  receipt: await client.receiptText(1, 2, 1),
  badArgs: await raw('getProduct', ['1']),
  notExposed: await raw('twoDigits', [1]),
};
await s.close();
client.__connect('http://127.0.0.1:1');
console.log(JSON.stringify({ ...out, serverDown: await client.productLabel(1) }));
`);
  const out = JSON.parse(execFileSync('npx', ['tsx', join(dir, 'run.mts')], { env: { ...process.env, SIGNING_KEY: 'demo-key' } }).toString());
  assert.deepEqual(out.labels, ['Widget - $12.50', 'Gadget - $99.99 (sold out)', 'error: no such product']);
  assert.deepEqual(out.canBuy, [true, false]);
  assert.equal(out.greeting, 'Hello, Ann Lee (gold)');
  assert.deepEqual(out.quotes, ['2 x Widget = $20.00 (20% off)', '3 x Gizmo = $15.00', 'error: out of stock']);
  assert.match(out.receipt, /^Receipt for Ann Lee: 2 x Widget, total \$20\.00 \[[0-9a-f]{16}\]$/);
  assert.deepEqual(out.badArgs, { ok: false, error: 'network: bad arguments for getProduct' });
  assert.deepEqual(out.notExposed, { ok: false, error: 'network: no such server function: twoDigits' });
  assert.match(out.serverDown, /^error: network: /);
});
