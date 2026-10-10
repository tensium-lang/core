<!-- This note was written and saved BEFORE any helper ran Experiment 4. It says what the experiment asks, what the ten tasks are, what I expect to happen on each, and how the results will be counted, so that nobody (including me) can quietly change the rules after seeing the answers. -->

# Experiment 4: "compiles under tsc --strict but is silently wrong"

Written before any agent ran. The commit that adds this file freezes the tasks, hidden tests, starter app, reference solutions, tempting-wrong versions and the Tensium checker.

## Why

In Experiment 2, on one task, both runs of the shared-types TypeScript arm passed `tsc --strict` and shipped a receipt verifier that always answers false. The two split-types TypeScript runs happened to get it right, so that is 2 of 4 TypeScript runs. Both Tensium runs made the same mistake and were stopped by the compiler. This experiment asks whether that was a fluke or a repeatable class.

## What is run

- Suite `silent` (`harness/silent/`): 10 change requests on the Experiment 2 shop app, plus one small addition to the starter in every arm (a per-order purchase limit and an `availability` function) so that task 05 has something to change.
- Arms: Tensium; TypeScript with a shared types file; TypeScript with per-side type copies. Same as Experiment 2. The TypeScript starter is left as it was there: it does not state in a comment that every server function must return a Result.
- 2 trials per task and arm, 60 runs. Agents: Claude Haiku 4.5. At most 6 submissions per run.
- Separately, a direct replication: Experiment 2's task `07-verify-receipt`, unchanged, 4 more trials per arm (12 runs), reported on its own.

## The headline number

**Clean but broken**: runs whose final submission passed the arm's own compiler and failed the hidden end-to-end tests. Reported per arm, next to compiler-clean and correct. A run that never gets compiler-clean is not correct, but it is not "clean but broken".

## The tasks were chosen to be hard for tsc

Each task has a natural implementation that `tsc --strict` accepts and that gives wrong answers. That is the hypothesis, not an accident. So if Tensium wins, the only supported claim is: **on bugs of this specific shape, Tensium catches what tsc ships.** It is not evidence that Tensium produces more correct code overall.

## Tasks and predictions

"Tempting version" = the natural wrong implementation, written by me, in `tasks/<id>/trap/`. The last two columns are what each compiler does with it (checked, no model involved).

| task | shape | tsc --strict on the tempting version | Tensium on the tempting version | prediction for agents |
|---|---|---|---|---|
| 01-coupon-check | server returns a bare boolean, client expects a Result | accepted, wrong answer | rejected (TN5006) | Tensium protected |
| 02-loyalty-points | server returns a bare number | accepted, wrong answer | rejected (TN5006) | Tensium protected |
| 03-store-notice | server returns a bare string | accepted, wrong answer | rejected (TN5006) | Tensium protected |
| 04-quantity-text | lenient number parsing accepts `2x`, `1.5`, ` 2` | accepted, wrong answer | no wrong version to write: `parseInt` is strict and returns a Result, so the natural version is correct | Tensium protected, by its standard library rather than a checker rule |
| 05-limit-reason | a yes/no helper becomes a Result; a stale `if (!helper(...))` is now always false | accepted, wrong answer | rejected (TN1003) | Tensium protected |
| 06-email-domain | missing `@`: `split('@')[1]` is typed string | accepted, wrong answer | accepted, wrong answer (`indexOf` returns -1; a hole in my standard library) | no advantage; tie |
| 07-shipping-region | lookup that can miss: `Record<string, number>` is typed number | accepted, wrong answer | a silent default (`return 0`) is accepted, wrong answer | partial: Tensium forces a return on every path but allows the wrong one |
| 08-not-found-null | server now answers null; a client cast still says `Product` | accepted, crashes at runtime | rejected (TN3002) | Tensium protected |
| 09-gift-quote | two ids of the same type sent in the wrong order | accepted, wrong answer | accepted, wrong answer | no advantage; tie |
| 10-you-save | discount percent applied to the wrong amount | accepted, wrong answer | accepted, wrong answer | no advantage; tie |

All hidden tests catch all tempting versions that compile (`npx tsx harness/boundary.ts traps --suite silent`). Every reference solution passes in every arm, and the starter fails every task (`verify --suite silent`).

Every ticket spells out each case the hidden tests check. So the agents may simply write everything correctly. That is a possible outcome and it would be a real null.

## How the result will be read

- **The finding repeats** if TypeScript runs ship clean-but-broken results on the "Tensium protected" tasks (01, 02, 03, 04, 05, 08) and Tensium runs do not.
- **Null** if the TypeScript arms ship no clean-but-broken runs, or one. The agents wrote it correctly without the checker's help, and the Experiment 2 result is not shown to be a repeatable class. This will be reported as prominently as a win.
- **Against Tensium** if Tensium ships as many clean-but-broken runs as TypeScript, or if its runs often fail to reach compiler-clean within the submission cap.
- Tasks 06, 09 and 10 are expected to tie. A Tensium advantage there would be noise or an effect I did not predict; a Tensium disadvantage there is a real cost and will be reported.

Counts are small (20 runs per arm). I will report raw counts per arm and per task, name every clean-but-broken run and say what went wrong in it, and give a Fisher exact test of Tensium against the two TypeScript arms pooled as a rough guide only.

## Rules I am holding myself to

1. No task, test or starter changes after any agent has run. If something turns out to be broken, I will say so, fix it, and re-run all three arms on that task, reporting both results.
2. The Tensium checker is frozen at this commit for the run. If the run exposes a checker gap, I will report it and, if I fix it, re-run all arms on the affected task.
3. Numbers come from the attempt logs and hidden tests, not from what agents say about themselves.
4. The scope limit above goes into the write-up in RESULTS.md.
