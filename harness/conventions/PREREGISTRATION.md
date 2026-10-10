<!-- This note was written and saved BEFORE any helper ran Experiment 5. It says what the experiment asks, what the ten conventions and ten tasks are, which compiler enforces which convention (checked with no model), what I expect to happen, and how the results will be counted, so that nobody (including me) can quietly change the rules after seeing the answers. -->

# Experiment 5: ten conventions in a doc, three compilers that enforce different subsets

Written before any agent ran. The commit that adds this file freezes the app in all three languages, the conventions, the ten tasks, their hidden tests, the reference solutions, the tempting-wrong versions, the harness and the Tensium compiler.

## Why

Experiments 2, 4 and 4b found one thing: agents ship a server function that returns a bare value where the client expects a Result, `tsc --strict` lets it through, and Tensium stops it; but one comment on the line the agent edits removes the TypeScript failures entirely. The open question from 4b was whether a comment still works when it is one of many conventions in a file the agent has to choose to read. The thesis also has a generic form that no experiment has tested yet: do strictness and structured diagnostics help agents at all? Rust already has most of the five guarantees in the thesis, so a Rust arm tests that form without Tensium in the way.

## What is run

- **App:** an invoicing service (customers, products, invoices with line items, payments, credit notes, signed receipts, reminders, reports), about 820 lines of TypeScript in 21 files, with the same fixtures and screens in Tensium (one file, 720 lines) and Rust (three crates, 22 files). The server is a pure calculator over fixed data; "recording" a payment gives back what it would mean. This is smaller than the 1,800 lines in my proposal; it was enough to put the convention, the helper that embodies it and the place a task is edited in three different files, and I did not want to pad it.
- **Conventions:** ten, written once in `CONTRIBUTING.md` (in `harness/conventions/app/`). Every arm gets the identical file, and every task brief says "The team's conventions are in CONTRIBUTING.md. Read them before you start." The only thing that differs between arms is which conventions the arm's checker also enforces.
- **Arms:**
  - `ts`: TypeScript, `tsc --strict` plus `typescript-eslint` recommended (no custom rules).
  - `rs`: Rust, `cargo build` plus `cargo clippy -- -D warnings`, with `unwrap_used`, `expect_used` and `panic` denied in each crate root, as the starter already has them.
  - `tn`: Tensium, its own compiler (extended for this experiment with lists, loops, `let mut`, enums, newtypes and record copies; frozen at this commit).
- **Tasks:** ten change requests, one aimed at each convention, in `harness/conventions/tasks/`. Identical tickets in every arm. Each has a reference solution and, where it can be written, a tempting-wrong version, in every arm.
- **Agents:** Claude Opus 5.5 only (Jay's decision: "Only test with an Opus agent"). 2 trials per task and arm: 60 runs. At most 6 submissions per run. Agents are told not to run compilers or tests; the submit command is their only feedback.
- Agents are started in waves of three tasks (18 agents), so every wave holds all three arms of each task.

## What each checker enforces, checked with no model

`npx tsx harness/conventions.ts traps`, on the tempting-wrong version of each task that I wrote:

| # | convention | task | TypeScript (tsc + eslint) | Rust (cargo + clippy) | Tensium |
|---|---|---|---|---|---|
| 1 | client-callable functions return a Result | 01-invoice-summary | accepted, wrong | cannot be written: the route table's type requires a Result | rejected (TN5006) |
| 2 | errors are values, never thrown | 02-record-payment | accepted, wrong (HTTP 400 reaches the client) | rejected (clippy::panic) | rejected (TN1001) |
| 3 | a Result is never ignored | 03-send-invoice | accepted, wrong | rejected (unused_must_use) | rejected (TN1002) |
| 4 | the webhook secret stays on the server | 04-webhook-check | accepted; the leak scan catches it | accepted; the leak scan catches it | rejected (TN5001) |
| 5 | nullable values are checked, no `!`/`as`/`unwrap` | 05-customer-phone | accepted, wrong (`phone!` prints "null") | rejected (clippy::unwrap_used) | rejected (TN3002) |
| 6 | ids are distinct types | 06-customer-credits | accepted, wrong | rejected (E0308) | rejected (TN0002) |
| 7 | money is integer cents through `percentOf` | 07-late-fee | accepted, wrong (4.5 cents rounds to 5, not 4) | accepted, wrong (`as f64 ... as i64` compiles) | accepted, wrong (numbers are doubles) |
| 8 | status changes go through `transition` | 08-settle | accepted; **tests pass** | rejected (E0451: the status field is private) | accepted; **tests pass** |
| 9 | the server recomputes totals | 09-confirm-statement | accepted, wrong | accepted, wrong | accepted, wrong |
| 10 | every file starts with a plain-words comment | 10-revenue-report | accepted; **tests pass** | accepted; **tests pass** | cannot be written: one file, and the compiler checks its header |

Rows 8 and 10 are violations that behave correctly, so the hidden tests cannot see them; they are counted from the source (below). Row 7 is where my proposal said Rust would enforce the money convention; it does not, once the agent converts to a float and back, and neither does Tensium. Row 9 is the control: nobody's compiler helps.

`verify` passes: in every arm the starter is checker-clean and passes the baseline, fails every task's hidden tests, and every reference solution is checker-clean and passes.

## What is counted

Per arm, over 20 runs (10 tasks × 2 trials):

- **Headline: clean but broken.** The final submission passed the arm's own checker and failed the hidden end-to-end tests. Same definition as before. Also: checker-clean, correct, clean on the first submission, mean submissions to clean.
- **Per convention, per arm**, from the attempt logs and the final source: *shipped* (the violation is in the final submission; for 1–7 and 9 that means the tests failed on it, for 8 and 10 it is found by reading the source), *caught* (a submission was rejected with the convention's code: TN5006, TN1001/1004, TN1002, TN5001, TN3002, TN0002-on-a-newtype, clippy::panic, unused_must_use, clippy::unwrap_used, E0308 on an id, E0451), and *never made*. Source checks, fixed now: for 5, `!.`/`!)`/`!;`/`as string` on a phone or `unwrap()` on it; for 7, `0.015`, `* 1.5`, `/ 100` or `Math.round`/`.round()`/`as f64` on money in the new code; for 8, `status: 'paid'`/`status: Status::Paid`/`status: Status.Paid` outside `transition`; for 10, a new source file whose first non-blank line is not a comment.
- **Cost:** submissions to clean, and runs that never reach clean within 6.

## Predictions

Mine (Claude's), written before the run. Jay made the design decisions and gave no numeric predictions.

| arm | clean but broken (of 20) | first-try clean (of 20) | runs never clean | where I expect the broken runs |
|---|---|---|---|---|
| TypeScript | **2** (0 to 5 would not surprise me) | 17 | 0 | 07 (float money), possibly 01 or 03 |
| Rust | **1** (0 to 2) | 11 | 0 or 1 | 07 only |
| Tensium | **1** (0 to 3) | 9 | 0 to 2 | 07 only |

Per convention: I expect 4 (secret) and 6 (id swap) never to be violated in any arm; 2 (throw) and 3 (ignored Result) to be violated rarely if at all by Opus; 1 (bare value) to be violated in at most 1 TypeScript run now that the doc states it; 5 (null) not to be violated; 7 (float money) to be the main source of failures, in 1 to 3 TypeScript runs and 0 to 1 in each other arm; 8 (direct status set) to be violated-but-correct in about 1 of 2 TypeScript runs and 1 of 2 Tensium runs, and caught in Rust; 9 (control) to be a tie at zero; 10 (header) to be violated in 0 to 2 of the TypeScript and Rust runs.

So the outcome I expect is **small and mostly about one convention**: a few float-money failures in TypeScript, fewer elsewhere, and everything else a tie. That would be weak support for enforcement, and no support for a new language over Rust.

## How the result will be read

Rules fixed now:

1. **Enforcement helps** if TypeScript ships at least 3 more clean-but-broken runs than Rust and at least 3 more than Tensium, with the broken runs on conventions the other arms enforce. Then the thesis's generic claim gets support at this scale, and the next question is Tensium against Rust: cost (submissions to clean, runs never clean) and whether Tensium's extra catches (rows 1 and 4 in the table, which Rust reaches by structure and by scan) ever mattered.
2. **Null** if every arm ships 1 or fewer clean-but-broken runs. Opus follows a ten-rule document; at this scale neither compiler is needed, and the experiment gives the thesis nothing. This will be reported as prominently as a win.
3. **The language costs more than it catches** if Tensium ships as many or more clean-but-broken runs as TypeScript, or if 3 or more Tensium runs never reach clean. That is reported first.
4. A difference that comes only from convention 7 or 9, which nobody's compiler enforces, is a difference in the agents' reading of the doc or in luck, not in enforcement, and will be reported as such.
5. Rows 8 and 10 are reported as "violated, correct" counts, separately from the headline, never folded into it.
6. 20 runs per arm: Fisher exact as a rough guide only; raw counts always shown; every clean-but-broken run named with what went wrong.
7. No task, test, starter, convention or checker changes after any agent has run. If something turns out to be broken, I will say so, fix it and re-run every arm on the affected task, reporting both results.
8. Numbers come from the attempt logs, the hidden tests and the final source, not from what agents say about themselves.

**Scope.** One model, one app of a few hundred lines, ten conventions chosen because each is something a compiler could in principle enforce, two trials per cell. The Tensium arm also carries an unfamiliar language with a reference sheet instead of training data, so it compares whole stacks. Whatever happens, the result is about these ten conventions on this app; it cannot show that any arm produces more correct code overall.
