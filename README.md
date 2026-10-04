<!-- This is the main guide to the project. It explains what Tensium is, how to run the rule-checker, and how to run the experiment that tests the idea. -->

# Tensium

An agent-native programming language. Strict, self-checking, compiles to TypeScript. Work in progress. https://tensium.dev

This repo is a **minimal proof of concept** for one thesis: agents write more correct code, faster, when the toolchain gives strict enforcement and *structured, machine-readable diagnostics* instead of prose errors.

## Setup

```
npm install
npm test          # 31 tests: one per diagnostic code, narrowing, fix-edits, emitted-TS validity (tsc --strict), and the header rule across the whole repo
```

## The checker

```
npx tsx src/cli.ts check examples/bad.tn                 # pretty-printed
npx tsx src/cli.ts check examples/bad.tn --format json   # JSON array — what an agent consumes
npx tsx src/cli.ts check examples/bad.tn --format prose  # one-line compiler-style messages
npx tsx src/cli.ts build examples/good.tn -o out.ts      # transpile to TypeScript (only if the check passes)
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
| TN0001–0011 | syntax, type mismatch, non-canonical syntax, undefined name, arity, missing return, duplicates, … |

### House rule: every file starts with a plain-words note

In the language: a `.tn` file with no top comment doesn't compile (TN4001), and a placeholder or tiny one doesn't either (TN4002). The suggested fix inserts a `// TODO ...` placeholder on purpose, so it still fails until a real explanation is written. The comment is copied to the top of the generated TypeScript. In this repo: `test/headers.test.ts` fails if any file (except JSON and lock files, which can't hold comments) lacks one.

Null narrowing supports `if (x !== null)`, `if (x === null) { return …; }` (rest of block), `&&`/`||`, and else-branches.
The parser recovers from errors, so one check reports everything it can find.

## The experiment

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
#   -> runs/r1/results.json, runs/r1/report.md, and the comparison table
```

Metrics: **iterations** = submissions until the checker reported OK (failing to get there within `--max-iter` = failed); **correct** = the final clean submission passes the hidden tests.

Caveats: agents are asked not to read `src/` or the tests but this is enforced by instruction, not sandboxing. Small N (10 tasks × trials) means differences are suggestive, not statistically significant — raise `--trials`.
