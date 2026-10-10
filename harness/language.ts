// This file writes the short guide to the Tensium language that every helper in the
// experiment gets to read, including how records and the client/server split are written.
// The list of ready-made tools in the guide is copied straight from src/prelude.ts, so the
// guide always matches the real language.

import { PRELUDE } from '../src/prelude.ts';
import { tyStr } from '../src/types.ts';

export type ReferenceKind = 'full' | 'terse';

const builtinList = (): string => Object.entries(PRELUDE)
  .map(([name, b]) => `- \`${b.sig ?? `${name}(${b.params.map(tyStr).join(', ')}): ${tyStr(b.ret)}`}\`${b.side === 'server' ? ' (server fn only)' : ''}`)
  .join('\n');

/** Records, lists, enums, newtypes and the client/server boundary: syntax only, the same text in both reference styles. */
const BOUNDARY = `## Records

\`\`\`
type User = { id: number, name: string, email: string | null }

fn label(u: User): string {
  let copy: User = { id: u.id, name: u.name, email: null };
  return copy.name;
}
\`\`\`

- Declare a record type with \`type Name = { field: type, ... }\`. Build a value with \`{ field: value, ... }\` and read a field with \`value.field\`.
- A record value must have exactly the fields of its type. Strings and numbers have no fields or methods; use the builtins.
- Records never change. To get a changed copy write \`{ ...u, name: "Bo" }\` (one spread, first, then the fields to change).

## Lists, loops and bindings that change

\`\`\`
fn total(prices: List<number>): number {
  let mut sum = 0;
  for (p in prices) { sum = sum + p; }
  return sum;
}

fn firstName(names: List<string>): string {
  let first = get(names, 0);
  if (first === null) { return "nobody"; }
  return first;
}
\`\`\`

- \`List<T>\` is a list; write one as \`[1, 2, 3]\` (an empty list needs a type: \`let mut xs: List<number> = [];\`).
- Lists never change either: \`push(xs, x)\` and \`concat(xs, ys)\` give back a new list, so keep the result: \`xs = push(xs, x);\`.
- \`get(xs, i)\` gives \`T | null\`; there is no \`xs[i]\`. \`len(xs)\` counts items; \`range(a, b)\` is the list a, a+1, ..., b-1.
- \`for (item in list) { ... }\` and \`while (cond) { ... }\` are statements. There is no \`break\`; use \`return\` to leave early.
- \`let\` bindings never change. A binding that must change is declared \`let mut x = ...;\` and updated with \`x = ...;\`.

## Enums

\`\`\`
enum Status { Draft, Sent, Paid }

fn label(s: Status): string {
  return match s {
    Draft => "not sent yet",
    Sent => "waiting for payment",
    Paid => "done",
  };
}
\`\`\`

- A value is written \`Status.Paid\`; compare with \`==\`. A \`match\` on an enum lists every member once, with no \`(name)\` binding and no wildcard.

## Newtypes

\`\`\`
newtype Cents = number;
newtype CustomerId = number;

fn withTax(c: Cents): Cents { return Cents(floor(c.value * 108 / 100)); }
\`\`\`

- A newtype wraps one plain number, string or boolean so it cannot be mixed up with any other value: a \`Cents\` is not a \`number\`, and not a \`CustomerId\`.
- Build one with \`Cents(250)\`; read the plain value with \`c.value\`. Arithmetic and comparison with \`<\` work on \`.value\`, not on the newtype; \`==\` compares two values of the same newtype.

## Client and server

\`\`\`
server fn getUser(id: number): Result<User, string> {
  let key = secret("DB_KEY");
  if (id == 1) { return ok({ id: 1, name: "Ann", email: null }); }
  return err("no such user");
}

client fn userLabel(id: number): string {
  match getUser(id) {
    ok(u) => { return u.name; }
    err(e) => { return "error: " + e; }
  }
}
\`\`\`

- \`server fn\` runs on the server, \`client fn\` runs on the client, and a plain \`fn\` is a helper that runs on either side.
- A \`client fn\` calls a \`server fn\` like any other function; the compiler turns that call into a network request. There is no \`async\` or \`await\`.
- \`secret("NAME")\` gives a \`Secret\`, which only server code can hold.
`;

/**
 * The language reference handed to every agent, identical across arms. Builtins are generated from the prelude.
 * 'full' explains the rules; 'terse' is syntax and builtins only, so the rules must be learned from compiler feedback.
 */
export function languageReference(kind: ReferenceKind = 'full'): string {
  if (kind === 'terse') return terseReference();
  const builtins = builtinList();
  return `# Tensium language reference

Tensium (\`.tn\`) is a small, strict, statically-checked language. A program is a list of function declarations.

## Every file starts with a comment

The first thing in every \`.tn\` file must be a \`//\` comment that says, in plain words a 5th grader could understand, what the file does (at least 5 words, finished, no \`TODO\`). A file without one does not compile.

## Syntax

\`\`\`
fn name(a: number, b: string): Result<number, string> {
  let x = len(b);                 // bindings are immutable; \`let x: T = ...\` annotation is optional when inferable
  if (x > 3) { return err("too long"); }
  return ok(a + x);
}
\`\`\`

- Types: \`number\`, \`string\`, \`boolean\`, \`void\`, \`Result<T, E>\`, \`List<T>\`, record types, enums, newtypes, and \`T | null\` (the only union).
- Every parameter and return type must be annotated. There is no \`any\`, no \`undefined\` (use \`null\`), no classes, no async, no plain objects or arrays (use records and lists).
- Statements: \`let\` / \`let mut\`, assignment to a \`let mut\`, \`return\`, \`if (...) {...} else {...}\`, \`match\`, \`for (x in list) {...}\`, \`while (...) {...}\`, and expression statements ending in \`;\`.
- Operators: \`+ - * / %\`, \`< > <= >=\`, \`== != === !==\` (same meaning), \`&& || !\`. \`+\` also concatenates strings (string + string only; use \`str(n)\` for numbers).
- Literals: numbers, strings (\`"..."\`), \`true\`, \`false\`, \`null\`.
- Comments: \`// ...\`.
- All functions are exported. Functions may call each other in any order and recurse.

## Results and match

- \`ok(v)\` and \`err(e)\` construct a Result. Failure is a value: functions that can fail return \`Result<T, E>\`. There is no \`throw\` and no \`try/catch\`.
- A Result is consumed with \`match\`, which must have both an \`ok(name)\` arm and an \`err(name)\` arm:

\`\`\`
match parseInt(s) {
  ok(n) => n * 2,
  err(e) => 0,
}
\`\`\`

- \`match\` and \`if/else\` are expressions: an arm is either an expression or a block \`{ ...statements; lastExpression }\` whose final expression has **no semicolon** and is the value. Use them as values (\`return match ...;\`, \`let x = if (...) {...} else {...};\`) or as statements (arms contain \`return\` statements; no value).
- \`return\` is not allowed inside an arm/branch that is being used as a value. It is fine inside match/if used as a statement.
- A function body's final expression is not an implicit return — write \`return\`.

## null

\`T | null\` values must be checked before use. These narrow \`x\` to \`T\`: \`if (x !== null) {...}\`, \`if (x === null) { return ...; }\` followed by the rest of the function, and \`x !== null && ...\`.

${BOUNDARY}
## Builtins

${builtins}
- \`ok(v)\`, \`err(e)\`

\`parseInt\` accepts only an optional leading \`-\` followed by digits (no spaces, no decimals).
`;
}

function terseReference(): string {
  const builtins = builtinList();
  return `# Tensium syntax sheet

Tensium (\`.tn\`) programs are lists of function declarations. Every file starts with a \`//\` comment saying in plain words what the file does.

\`\`\`
// This file has two small helper functions for working with numbers.
fn name(a: number, b: string): Result<number, string> {
  let x = len(b);
  if (x > 3) { return err("too long"); }
  return ok(a + x);
}

fn pick(r: Result<number, string>): number {
  return match r {
    ok(n) => n,
    err(e) => { 0 },
  };
}
\`\`\`

- Types: \`number\`, \`string\`, \`boolean\`, \`void\`, \`Result<T, E>\`, \`List<T>\`, \`T | null\`, and the record, enum and newtype declarations below.
- Statements: \`let x = ...;\`, \`let mut x = ...;\` then \`x = ...;\`, \`return ...;\`, \`if (...) {...} else {...}\`, \`for (x in list) {...}\`, \`while (...) {...}\`, expression statements.
- \`ok(v)\` and \`err(e)\` build a Result. \`match\` takes \`ok(name) => ...\` and \`err(name) => ...\` arms; an arm is an expression or a block.
- \`if/else\` and \`match\` can be used as expressions; a block's last expression without \`;\` is its value.
- Operators: \`+ - * / %\`, \`< > <= >=\`, \`== != === !==\`, \`&& || !\`. Literals: numbers, \`"strings"\`, \`true\`, \`false\`, \`null\`. Comments: \`//\`.
- Functions can call each other in any order and can recurse. There are no plain objects or arrays (use records and lists), no methods, no \`break\`.

${BOUNDARY}
## Builtins

${builtins}

\`parseInt\` accepts only an optional leading \`-\` followed by digits.
`;
}
