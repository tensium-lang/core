// This file writes the short guide to the Tensium language that every helper in the
// experiment gets to read, including how records and the client/server split are written.
// The list of ready-made tools in the guide is copied straight from src/prelude.ts, so the
// guide always matches the real language.

import { PRELUDE } from '../src/prelude.ts';
import { tyStr } from '../src/types.ts';

export type ReferenceKind = 'full' | 'terse';

const builtinList = (): string => Object.entries(PRELUDE)
  .map(([name, b]) => `- \`${name}(${b.params.map(tyStr).join(', ')}): ${tyStr(b.ret)}\`${b.side === 'server' ? ' (server fn only)' : ''}`)
  .join('\n');

/** Records and the client/server boundary: syntax only, the same text in both reference styles. */
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

- Types: \`number\`, \`string\`, \`boolean\`, \`void\`, \`Result<T, E>\`, and \`T | null\` (the only union).
- Every parameter and return type must be annotated. There is no \`any\`, no \`undefined\` (use \`null\`), no classes, no async, no arrays/objects.
- Statements: \`let\`, \`return\`, \`if (...) {...} else {...}\`, \`match\`, and expression statements ending in \`;\`.
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

- Types: \`number\`, \`string\`, \`boolean\`, \`void\`, \`Result<T, E>\`, \`T | null\`.
- Statements: \`let x = ...;\`, \`return ...;\`, \`if (...) {...} else {...}\`, expression statements.
- \`ok(v)\` and \`err(e)\` build a Result. \`match\` takes \`ok(name) => ...\` and \`err(name) => ...\` arms; an arm is an expression or a block.
- \`if/else\` and \`match\` can be used as expressions; a block's last expression without \`;\` is its value.
- Operators: \`+ - * / %\`, \`< > <= >=\`, \`== != === !==\`, \`&& || !\`. Literals: numbers, \`"strings"\`, \`true\`, \`false\`, \`null\`. Comments: \`//\`.
- Functions can call each other in any order and can recurse. There are no loops, arrays, or objects.

${BOUNDARY}
## Builtins

${builtins}

\`parseInt\` accepts only an optional leading \`-\` followed by digits.
`;
}
