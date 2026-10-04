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
