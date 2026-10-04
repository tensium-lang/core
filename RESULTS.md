<!-- This is the lab notebook. It records what each experiment run found, in plain numbers, including the runs where nothing happened and the mistakes in the tools that the runs exposed. -->

# Results so far

Raw run folders live in `runs/` (git-ignored). Every number here comes from the attempt logs and hidden tests, not from what the agents said about themselves. Samples are small; treat differences of one or two runs as noise.

## Experiment 1: does structured feedback beat prose? (same language, same checker)

Arm A gets one-line prose errors, arm B gets the JSON diagnostics. "Fixed next try" = a failed submission followed immediately by a clean one.

| run | agents | reference | tasks | correct A / B | clean on 1st submit A / B | mean submissions A / B |
|---|---|---|---|---|---|---|
| r1 | Sonnet 5.5 | full | 01–10 | 10/10 / 10/10 | 10 / 10 | 1.0 / 1.0 |
| r2 | Sonnet 5.5 | full | 11–20, 2 trials | 20/20 / 20/20 | 20 / 20 | 1.0 / 1.0 |
| r3 | Haiku 4.5 | syntax only | 11–20, 2 trials | 20/20 / 20/20 | 14 / 13 | 1.4 / 1.6 |
| r4 | Haiku 4.5 | syntax only | same, after the TN0010 fix | 20/20 / 19/20 | 14 / 11 | 1.4 / 1.6 |
| r5 | Haiku 4.5 | syntax only | 21–30 (rule-tempting), 2 trials | 20/20 / 19/20 | 15 / 16 | 1.3 / 1.3 |

- Fixed next try, r3–r5 pooled: prose 17 of 23 (74%), JSON 20 of 27 (74%).
- **No measurable difference between prose and JSON.** Sonnet never needed feedback at all.
- The thesis rules (throw, ignored or misused Result, missing match arm, unchecked null) almost never fired; agents wrote correct code from one example. Most failures were one syntax rule (`return` inside a value arm, TN0010).
- Both hidden-test failures were logic bugs no checker rule covers.

### Applying the suggested edits with no model (`harness/cli.ts autofix`)

| run | failed submissions | repaired to a program that passes the hidden tests |
|---|---|---|
| r3 | 19 | 11 (58%) |
| r4 | 20 | 12 (60%) |
| r5 | 11 | 7 (64%) |

No repair produced a program that compiled but gave wrong answers. The structured `edit` field has value to a script even though it made no difference to an agent.

## Experiment 2: the client/server boundary

### Planted mistakes, no model (`harness/boundary.ts drift`)

| planted mistake | Tensium | TypeScript, shared types | TypeScript, split types |
|---|---|---|---|
| server renames a field; client not updated | rejected (TN5004) | rejected (TS2339) | compiles; fails at runtime |
| server and client disagree on argument order | rejected (TN0002) | compiles; fails at runtime | compiles; fails at runtime |
| client uses the signing key | rejected (TN5001) | compiles; key is in client code | compiles; key is in client code |
| server returns a bare value; client expects a Result | rejected (TN5006) | compiles; fails at runtime | compiles; fails at runtime |

### Run b1: 7 change requests × 3 arms × 2 trials, Haiku 4.5, max 6 submissions

| arm | runs | compiler-clean | correct | clean but broken | clean on 1st submit | mean submissions |
|---|---|---|---|---|---|---|
| Tensium | 14 | 14 | 14 | 0 | 10 | 1.7 |
| TypeScript, shared types | 14 | 14 | 12 | 2 | 14 | 1.0 |
| TypeScript, split types | 14 | 14 | 14 | 0 | 14 | 1.0 |

- **Tasks 01–05** (rename, split, add, retype a field; add an argument): every arm, every run correct on the first submission. On an app this small the agents did not miss a usage, so the field-drift checks had nothing to catch.
- **Task 07** (verify a receipt without leaking the key): 4 of 6 runs made the same mistake, a server function returning a bare boolean while the client expected an ok/err Result. Both Tensium runs were stopped by TN5006 and fixed it on the next submission. Both TypeScript runs that made it passed `tsc --strict` and shipped a function that always answers false. No run leaked the key.
- **Task 06** (make a field nullable): both Tensium runs needed 5 submissions. That was a checker gap, not the agents: null checks on a field (`if (c.email === null)`) were not recognised, and the suggested fix said to do exactly what the agent had done. Fixed after the run; replaying both agents' first submissions through the fixed checker, both compile and pass the hidden tests.

What this supports: the boundary rules catch a real mistake that agents make and that TypeScript does not catch. What it does not show: an overall correctness advantage. It is 2 runs out of 14, one task, one model, and the Tensium arm paid more submissions (partly my checker's fault).

## Experiment 4: compiles under `tsc --strict`, silently wrong

**Scope, stated first.** These 10 tasks were chosen because their natural implementation passes `tsc --strict` and gives wrong answers. So the only claim this experiment can support is narrow: *on bugs of this specific shape, Tensium catches what tsc ships.* It says nothing about whether Tensium produces more correct code overall.

Tasks, hidden tests, starter, reference solutions, predictions and the checker were frozen in commit `cd32725` before any agent ran (`harness/silent/PREREGISTRATION.md`). Nothing was changed afterwards and no task was re-run.

Setup: 10 change requests on the shop app × 3 arms × 2 trials = 60 runs, Haiku 4.5, at most 6 submissions.

### Headline: clean but broken

| arm | runs | compiler-clean | correct | **clean but broken** | clean on 1st submit | mean submissions |
|---|---|---|---|---|---|---|
| Tensium | 20 | 20 | 20 | **0** | 14 | 1.3 |
| TypeScript, shared types | 20 | 20 | 16 | **4** | 20 | 1.0 |
| TypeScript, split types | 20 | 20 | 18 | **2** | 20 | 1.0 |

Rough guide only: Tensium 0 of 20 against TypeScript 6 of 40 pooled gives a Fisher exact p of 0.08 one-sided (0.17 two-sided). That is not below 0.05; the sample is small.

### Where the broken runs were

| task | shape | Tensium | TS shared | TS split | predicted | outcome |
|---|---|---|---|---|---|---|
| 01-coupon-check | server returns a bare boolean | 0 of 2 | 1 of 2 | 0 of 2 | Tensium protected | as predicted |
| 02-loyalty-points | server returns a bare number | 0 of 2 | 2 of 2 | 2 of 2 | Tensium protected | as predicted |
| 03-store-notice | server returns a bare string | 0 of 2 | 1 of 2 | 0 of 2 | Tensium protected | as predicted |
| 04-quantity-text | lenient number parsing | 0 | 0 | 0 | Tensium protected | **null**: TypeScript agents validated the text properly |
| 05-limit-reason | stale `if (!helper(...))` after a yes/no becomes a Result | 0 | 0 | 0 | Tensium protected | **null**: TypeScript agents updated both call sites |
| 06-email-domain | missing `@` | 0 | 0 | 0 | tie | tie |
| 07-shipping-region | lookup that can miss | 0 | 0 | 0 | partial | **null**: every agent wrote an if-chain with an explicit error |
| 08-not-found-null | null hidden behind a client cast | 0 | 0 | 0 | Tensium protected | **null**: TypeScript agents added the null check |
| 09-gift-quote | same-typed ids in the wrong order | 0 | 0 | 0 | tie | tie |
| 10-you-save | percent of the wrong amount | 0 | 0 | 0 | tie | tie |

Cells are clean-but-broken runs out of 2. On tasks 04–10 all 42 runs were correct on their first submission.

**Every one of the 6 broken runs is the same bug**, and it is the Experiment 2 bug: the new server function returns a bare value (`boolean`, `number` or `string`), the client reads `r.ok` on it, and the function shows `error: undefined` for every input. `tsc --strict` accepted all six. The 6 TypeScript runs on those tasks that returned a `Result` were correct.

**Tensium agents made the same mistake more often, and shipped it never.** On tasks 01–03 all 6 Tensium runs returned a bare value on their first submission, were rejected with `TN5006`, fixed it on the second and were correct. That is where all of Tensium's extra submissions came from. No Tensium run failed to reach compiler-clean.

### Direct replication of Experiment 2's task 07

The original task, unchanged, 4 more trials per arm (12 runs):

| arm | runs | correct | clean but broken |
|---|---|---|---|
| Tensium | 4 | 4 | 0 |
| TypeScript, shared types | 4 | 4 | 0 |
| TypeScript, split types | 4 | 4 | 0 |

**On the original task the result did not repeat.** All 8 TypeScript runs returned a `Result` this time (in Experiment 2 it was 2 of 4). Three of the 4 Tensium runs returned a bare boolean first and were stopped by `TN5006`.

### The bare-value mistake, pooled across everything run so far

| task | TypeScript runs that shipped it | Tensium runs that wrote it first / shipped it |
|---|---|---|
| receipt check (Exp 2 + replication) | 2 of 12 | 5 of 6 / 0 |
| coupon check | 1 of 4 | 2 of 2 / 0 |
| loyalty points | 4 of 4 | 2 of 2 / 0 |
| store notice | 1 of 4 | 2 of 2 / 0 |
| **total** | **8 of 24** | **11 of 12 / 0** |

### What this does and does not show

- **Not a fluke, as a class.** A server function that returns a bare value where the client expects a Result is a mistake Haiku makes repeatedly, on four different tasks. `tsc --strict` let it through every time (8 of 8), and Tensium stopped it every time (11 of 11).
- **Not a steady rate.** It ranged from 0 of 8 on one day's replication to 4 of 4 on the points task. The original single data point overstated how often TypeScript agents make it on that task.
- **Only this one shape repeated.** The other shapes I predicted Tensium would protect against (lenient parsing, a stale yes/no check, a null behind a cast) produced nothing: TypeScript agents simply wrote them correctly. Those predictions were wrong about agents, even though the compilers behave as predicted on the planted versions.
- **Where neither compiler helps, nothing broke either.** Tasks 06, 09 and 10 were ties at zero.
- **Unexplained:** Tensium agents wrote the bare-value version far more often than TypeScript agents did (11 of 12 against 8 of 24). I have not tested why. It means the benefit is that the mistake cannot ship, not that it is made less often.
- **Limits:** one model, one small app, 2 trials per cell, and a TypeScript starter that does not say in a comment that every server function must return a Result. A one-line comment or a typed route table might remove most of the TypeScript failures; that has not been tested.
