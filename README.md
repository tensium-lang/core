<!-- This is the main guide to the project. It explains what Tensium is, how to run the rule-checker, and how to run the experiment that tests the idea. -->

# Tensium

An agent-native programming language. Strict, self-checking, compiles to TypeScript. Work in progress. https://tensium.dev

This repo is a **minimal proof of concept** for one thesis: agents write more correct code, faster, when the toolchain gives strict enforcement and *structured, machine-readable diagnostics* instead of prose errors.

What the experiments have found so far is in [RESULTS.md](RESULTS.md); the thesis itself is in [thesis.md](thesis.md).

## Setup

```
npm install
npm test          # 48 tests: one per diagnostic code, narrowing, fix-edits, the client/server boundary (incl. a real HTTP round trip),
                  # emitted-TS validity under tsc --strict, and the header rule across the whole repo
```

## The checker

```
npx tsx src/cli.ts check examples/bad.tn                 # pretty-printed
npx tsx src/cli.ts check examples/bad.tn --format json   # JSON array — what an agent consumes
npx tsx src/cli.ts check examples/bad.tn --format prose  # one-line compiler-style messages
npx tsx src/cli.ts build examples/good.tn -o out.ts      # transpile to TypeScript (only if the check passes)
npx tsx src/cli.ts fix examples/bad.tn [--write]          # apply the checker's own suggested edits until clean or stuck (no model, no guessing)
```

Exit code is 1 when there are errors. Language reference: `harness/language.ts` generates it (`runs/<id>/LANGUAGE.md`).

Each diagnostic: `{ code, severity, message, span: {file, startLine, startCol, endLine, endCol}, expected, actual, suggestedFix }`.
`endCol` is exclusive. `suggestedFix` is `{ description, edit?: { span, newText } }` — `edit` is present when the fix is mechanical (zero-width span = insert).

| Code | Rule |
|---|---|
| TN1001 / TN1004 | `throw` / `try-catch` — errors are values |
| TN1002 | a `Result` is ignored (bare call statement, or a `let`-bound Result never matched) |
| TN1003 | a `Result` is used where its `T` is expected (`parseInt(s) + 1`) |
| TN2001–2004 | `match` not exhaustive / duplicate arm / unknown pattern / scrutinee is not a Result |
| TN3001 | implicit or explicit `any` (missing param/return annotation, un-inferable `let`) |
| TN3002 | `null`/`undefined` not handled (`T \| null` used as `T` without a check; `undefined`) |
| TN4001 / TN4002 | **file header rule**: every `.tn` file must start with a `//` comment explaining, in plain words a 5th grader could follow, what the file does (missing / too short or still has `TODO`) |
| TN5001–5006 | **client/server boundary** (see below): secrets outside server code, secrets crossing the wire, wrong-side calls, unknown or missing record fields, boundary calls that don't return `Result<T, string>` |
| TN0001–0011 | syntax, type mismatch, non-canonical syntax, undefined name, arity, missing return, duplicates, … |

### House rule: every file starts with a plain-words note

In the language: a `.tn` file with no top comment doesn't compile (TN4001), and a placeholder or tiny one doesn't either (TN4002). The suggested fix inserts a `// TODO ...` placeholder on purpose, so it still fails until a real explanation is written. The comment is copied to the top of the generated TypeScript. In this repo: `test/headers.test.ts` fails if any file (except JSON and lock files, which can't hold comments) lacks one.

Null narrowing supports `if (x !== null)`, `if (x === null) { return …; }` (rest of block), `&&`/`||`, and else-branches, on plain names and on field paths such as `c.email`.
The parser recovers from errors, so one check reports everything it can find.

## The client/server boundary

One `.tn` file holds both halves of an app. Record types are declared once, so the two sides cannot disagree about them.

```
type User = { id: number, name: string }

server fn getUser(id: number): Result<User, string> {   // runs on the server
  let key = secret("DB_KEY");                            // Secret: server-only
  ...
}

client fn userLabel(id: number): string {                // runs on the client
  match getUser(id) {                                    // this call crosses the network
    ok(u) => { return u.name; }
    err(e) => { return "error: " + e; }
  }
}
```

```
npx tsx src/cli.ts build examples/shop.tn -o out/shop    # writes out/shop.server.ts and out/shop.client.ts
```

- **Sides:** `server fn`, `client fn`, and plain `fn` (a helper that runs on either side). A `client fn` calling a `server fn` is the boundary.
- **No `async`/`await` in the language.** The compiler emits every sided function as `async` and inserts every `await` itself.
- **Real HTTP.** The server file exports `__serve(port)` (`POST /rpc/<name>`, JSON array of arguments); the client file exports `__connect(url)` and uses `fetch`.
- **Only what the client calls is reachable.** Other server functions get no route. Arguments are checked against their types on arrival, and responses are checked on the client, so a bad or stale peer becomes `err("network: ...")` instead of a wrong-typed value.
- **Secrets stay on the server.** The client file contains no server function bodies, no server-only builtins and no secret names.

| Code | Fires when | Mechanical fix |
|---|---|---|
| TN5001 | client or shared code uses `secret(...)`, a server-only builtin, or a type that holds a `Secret` | for a shared fn: insert `server ` |
| TN5002 | a server fn that client code calls takes or returns a `Secret` | – |
| TN5003 | server code calls a `client fn`, or a shared fn calls a sided fn | shared → client: insert `client ` |
| TN5004 | a field doesn't exist on the record type | rename to the obvious candidate, when there is exactly one |
| TN5005 | a record value has unknown or missing fields | rename, as above |
| TN5006 | a server fn that client code calls doesn't return `Result<T, string>` (a network call can fail, and that failure must be a value) | wrap the return type; returns then get an `ok(...)` edit |

Renaming a field in a shared type flags every stale use on both sides in one check, and `tn fix` repairs them (see `test/boundary.test.ts`).

Limits of this version: calls run one after another (no parallel server calls); the error type across the boundary is fixed to `string`; no effect tracking beyond the server/client marker; server-only builtins are just `secret` and `sign`.

## Experiment 2: the client/server boundary

Question: when an agent changes a two-sided app, does a compiler that guards the boundary stop it shipping an app whose halves disagree?

- **App:** a small shop (`examples/shop.tn`; TypeScript mirror in `harness/boundary/app/ts/`), with products, customers, quotes and signed receipts.
- **Arms:** `tn` (Tensium, one file, Tensium compiler), `ts-shared` (TypeScript, server and client import one `types.ts`, `tsc --strict`), `ts-split` (TypeScript, each side has its own copy of the types, `tsc --strict`). The split variant is generated from the shared one.
- **Tasks:** 7 change requests in `harness/boundary/tasks/NN-name/` (`ticket.md`, hidden `tests.ts`, a reference `solution/` per arm): rename a field, split a field, add a field, change a field's type, add an argument, make a field nullable, add a feature that must not leak the signing key.
- **Scoring:** the hidden tests start the real server, drive the client over HTTP, check every line of output and the wire format, and (for the last task) scan the client code for the secret.

```
npx tsx harness/boundary.ts verify [--suite boundary|silent]   # no agents: starter + every reference solution, in every arm
npx tsx harness/boundary.ts drift       # no agents: plant one-sided mistakes in every arm; which compiler notices?
npx tsx harness/boundary.ts init --run b1 [--suite boundary|silent] [--arms tn,ts-shared,ts-split] [--trials 1] [--max-iter 6] [--tasks id,id] [--note TEXT]
#   -> runs/b1/<task>__<arm>__t<k>/TASK.md; hand each to a fresh agent, which edits the app and calls:
#      npx tsx harness/boundary.ts submit <workdir>     (feedback from that arm's own compiler)
npx tsx harness/boundary.ts score b1    # hidden end-to-end tests on each final submission -> runs/b1/report.md
```

The key number is **clean but broken**: runs whose final submission passed its own compiler and still failed the hidden tests.

Caveat: the Tensium arm also carries an unfamiliar language, so this compares whole stacks, not one variable.

## Experiment 4: compiles under `tsc --strict`, silently wrong

Question: was Experiment 2's one clear catch a fluke? Ten change requests (`harness/silent/tasks/`) on the same shop app, each with a natural implementation that `tsc --strict` accepts and that gives wrong answers: a server function returning a bare value where the client expects a Result, lenient parsing, a stale yes/no check, a missing-case lookup, a null hidden behind a cast, and three where no compiler can help. Same three arms and the same commands as Experiment 2, with `--suite silent`.

```
npx tsx harness/boundary.ts traps --suite silent    # no agents: each task's tempting-but-wrong version through every compiler and the hidden tests
```

The tasks, the predictions and the rules for reading the result were written down before any agent ran: `harness/silent/PREREGISTRATION.md`. The tasks were chosen to be hard for `tsc`, so a Tensium win only means "on bugs of this shape, Tensium catches what tsc ships".

### Experiment 4b: can plain TypeScript be given the same protection cheaply?

The one bug that repeated in Experiment 4 was a server function returning a bare value. Two TypeScript baselines a real team might ship, each one change to the starter's `server.ts`, made by the harness:

- `ts-shared-comment`, `ts-split-comment`: a one-line comment above the route table saying every client-callable function must return a Result.
- `ts-shared-typed`, `ts-split-typed`: the route table is typed (`ServerHandler`), so `tsc --strict` rejects a route whose function returns a bare value.

```
npx tsx harness/boundary.ts traps --suite silent --tasks 01-coupon-check,02-loyalty-points,03-store-notice \
  --arms tn,ts-shared,ts-split,ts-shared-comment,ts-split-comment,ts-shared-typed,ts-split-typed
```

`verify`, `traps` and `init` all take `--arms` and `--tasks`. Baselines, predictions and the reading rule (comment fixes it / only the wrapper fixes it / neither): `harness/silent/PREREGISTRATION-4b.md`.

## Experiment 1: feedback format

Question: given the same task, language and model, does the *format* of compiler feedback change iterations-to-correct and final correctness?

- **Arms** (set at `init`, default `A=prose,B=json`): both arms use the same checker and the same rules. A gets `solution.tn(2,3): error TN1002: Result value is not handled.`; B gets the structured JSON (expected/actual/span/suggestedFix).
- **Tasks:** `harness/tasks/NN-name/{prompt.md,tests.ts}`, discovered from the directory. `tests.ts` is hidden from the agent and run against the transpiled TypeScript.
- **No model is built into the harness.** The agent is whatever you point at a work directory — I used fresh Claude Code subagents (same model for every run). The harness only creates work dirs, serves feedback, logs attempts and scores.

```
npx tsx harness/cli.ts init --run r1 [--arms A=prose,B=json] [--trials 1] [--max-iter 5] [--tasks id,id] [--reference full|terse] [--note TEXT]
#   --reference terse = syntax sheet only (rules must be learned from feedback); full = also explains the rules
#   --note is free text recorded with the run, e.g. which model drove the agents
#   -> runs/r1/<task>__<arm>__t<k>/TASK.md for each run; hand each TASK.md to a fresh agent
#   the agent edits solution.tn and calls:  npx tsx harness/cli.ts submit <workdir>   (this logs the attempt)
npx tsx harness/cli.ts score r1
npx tsx harness/cli.ts autofix r1
#   -> no model: applies only the checker's suggested edits to every FAILED submission and reports how many become
#      clean and pass the hidden tests (runs/r1/autofix.md). Measures diagnostic quality independent of any agent.
#   -> runs/r1/results.json, runs/r1/report.md, and the comparison table
```

Metrics: **iterations** = submissions until the checker reported OK (failing to get there within `--max-iter` = failed); **correct** = the final clean submission passes the hidden tests.

Caveats: agents are asked not to read `src/` or the tests but this is enforced by instruction, not sandboxing. Small N (10 tasks × trials) means differences are suggestive, not statistically significant — raise `--trials`.
