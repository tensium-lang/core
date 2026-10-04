<!-- This note was written and saved BEFORE any helper ran Experiment 4b. Experiment 4 found one bug that TypeScript let through and Tensium stopped. This follow-up gives TypeScript two cheap ways to stop that same bug (a one-line comment, and a small type) and asks whether either is enough. It says what will be run, what I expect, and how the answer will be read, so the rules cannot quietly change after the results are in. -->

# Experiment 4b: can plain TypeScript be given the same protection cheaply?

Written before any agent ran. The commit that adds this file freezes the two baselines, the predictions and the reading rule. Tasks 01–03, their hidden tests, the starter app, the reference solutions and the Tensium checker are unchanged from the Experiment 4 freeze (`cd32725`).

## Why

Experiment 4's only repeatable finding was one bug: a new server function returns a bare value, the client expects an ok/err Result, `tsc --strict` accepts it, and the feature is silently wrong. TypeScript agents shipped it in 6 of 12 runs on tasks 01–03. Tensium agents wrote it in 6 of 6 and shipped it in 0, because `TN5006` rejects it.

The TypeScript starter in that experiment did nothing to prevent the bug. A real team would. If something a team can add in a minute removes the failures, then this finding is an argument for that minute of work, not for a new language. This experiment tests the two obvious candidates.

## The two baselines

Each is one change to the TypeScript starter's `server.ts`, applied by the harness (`withVariant` in `harness/boundary.ts`). Nothing else differs: same tickets, same hidden tests, same task brief, same `tsc --strict`.

**(A) Comment.** One line directly above the route table, which every new server function has to be added to:

```ts
// Convention: every function the client can call must return a Result (ok(...) or err(...)), never a bare value.
const routes: Record<string, (args: any[]) => unknown> = {
```

The compiler still accepts a bare-value return. Arms: `ts-shared-comment`, `ts-split-comment`.

**(B) Typed route table.** No comment. The route table's handler type changes from "returns anything" to "returns a Result":

```ts
type ServerHandler = (args: any[]) => Result<unknown, string>;

const routes: Record<string, ServerHandler> = {
```

Now `tsc --strict` rejects a route whose function returns a bare value. Arms: `ts-shared-typed`, `ts-split-typed`.

This is the smallest structural fix that closes the hole. It does not type the client's `rpc<T>` call against the table (a team could go further, as tRPC does); it only does what was asked: make the compiler reject the bare-value return. Note that the type is itself readable by the agent, so (B) carries a hint as well as a check. That is how a type helper works in practice, so I am leaving it in rather than trying to separate the two.

### Checked with no model, before the run

`npx tsx harness/boundary.ts traps --suite silent --arms ... --tasks 01-coupon-check,02-loyalty-points,03-store-notice`, on the bare-value version of each task that I wrote for Experiment 4:

| arm | compiler on the bare-value version (all 3 tasks) | hidden tests |
|---|---|---|
| Tensium | rejected (TN5006) | never ships |
| TypeScript, plain (shared and split) | accepted | fail |
| (A) comment (shared and split) | accepted | fail |
| (B) typed route table (shared and split) | rejected (TS2322) | never ships |

`verify` with the same arms and tasks: in all four new arms the starter compiles and passes the baseline tests, fails each task's hidden tests, and each reference solution compiles and passes.

## What is run

- Tasks `01-coupon-check`, `02-loyalty-points`, `03-store-notice` only, unchanged.
- 7 arms: the two (A) arms, the two (B) arms, and the three original arms again (Tensium, plain TypeScript shared, plain TypeScript split) as a same-day control.
- 2 trials per task and arm: 42 runs. Agents: Claude Haiku 4.5. At most 6 submissions per run. Same task brief as Experiment 4.
- Agents are started in three waves, one per task, so every wave holds all seven arms.

**Why the control is re-run.** The bare-value rate is not steady: 6 of 12 on these tasks in Experiment 4, but 0 of 8 on the receipt task's replication the same week. Without plain TypeScript arms on the same day, "the comment arm shipped none" could not be told apart from "nobody shipped it today". The earlier 6 of 12 will be shown next to today's control, not pooled into it.

## What is counted

Per baseline, the two layouts (shared and split types) are added together: 12 runs for (A), 12 for (B), 12 for plain TypeScript, 6 for Tensium.

- **Headline: clean but broken** — the final submission passed the arm's own compiler and failed the hidden end-to-end tests. Same definition as Experiment 4.
- Also reported: compiler-clean, correct, clean on the first submission, mean submissions.
- For (B) and Tensium: how many runs wrote the bare-value version first and were stopped by the compiler (TS2322 on the route table / TN5006).
- For (B): whether any run got past the type without fixing the bug (a cast such as `as any`, editing or deleting `ServerHandler`, or re-typing `routes`). I will read every final `server.ts` in the (B) arms for this and report the count, including zero.
- Every clean-but-broken run will be named, with what went wrong in it.

## Predictions

These are mine: Claude, the assistant running the experiment. Jay asked for a prediction for each baseline to be registered before the run and had not given any of their own when this was committed, so none of Jay's are recorded here.

| arm | clean but broken, predicted | what I expect to see |
|---|---|---|
| plain TypeScript (control) | 4 of 12; anything from 2 to 8 would not surprise me | the bare-value bug again, mostly on the points task |
| **(A) comment** | **0 of 12.** 1 would not surprise me; 3 or more would | agents read the line next to the table they must edit and return a Result |
| **(B) typed route table** | **0 of 12** | most agents see the type and return a Result straight away; I expect 2 to 4 of 12 to write the bare value first, get TS2322 and fix it on the next submission. No run casts its way around the type |
| Tensium (control) | 0 of 6 | 5 or 6 of 6 write the bare value first and are stopped by TN5006, as before |

So the outcome I expect is **"the comment fixes it"**. That is the outcome least favourable to Tensium, and I think it is the most likely one.

## How the result will be read

A baseline **fixes it** if it ships 0 clean-but-broken runs of 12. Then exactly one of three outcomes holds:

| outcome | rule | what it implies for "new language or type helper?" |
|---|---|---|
| **The comment fixes it** | (A) ships 0 of 12 | The Experiment 4 finding was a convention the starter did not state. One line of English removes it. This finding does not justify a new language, and it does not even justify a type helper. Whatever case there is for Tensium has to come from somewhere else. |
| **Only the wrapper fixes it** | (A) ships 1 or more, (B) ships 0 of 12 | Telling the agent is not reliable; making the compiler refuse is. That supports the thesis's claim that enforcement beats convention. But the enforcement was a two-line TypeScript change, so for this bug a new language is not needed. What would remain for Tensium is that the check is there by default on every boundary function, with nobody having to think of writing the helper first, and that it has no cast to get around it. Neither of those is tested by this experiment. |
| **Neither fixes it** | (A) ships 1 or more, (B) ships 1 or more | Agents got a wrong feature past a type helper (by casting, by weakening the type, or by a mistake on the client that the helper does not cover). That would be the strongest support so far for a checker with no escape hatch, still only for this one bug shape. It would not show the language is needed for anything else. |

Further rules, fixed now:

1. **A zero only counts against a control that is not zero.** If today's plain TypeScript arms ship 2 or fewer of 12, a zero in (A) will be reported as "uninformative: the control did not fail today either", not as "the comment fixes it". (B) can still be read on that day through the count of bare-value submissions that TS2322 rejected.
2. **Degree is reported, not rounded.** If (A) ships 1 or 2 of 12 against a control of 4 or more, the outcome is still "only the wrapper fixes it" or "neither", and I will add that the comment reduced the bug without removing it. With 12 runs per arm, 0 against 6 is clear (Fisher exact, one-sided, p ≈ 0.007); 0 against 3 is not (p ≈ 0.11). I will give the test as a rough guide only.
3. **If Tensium ships a clean-but-broken run, or fails to reach compiler-clean**, that is reported first, ahead of the baselines.
4. **The scope limit of Experiment 4 still holds and tightens.** These three tasks were picked because TypeScript agents failed them. Whatever happens, the result is about this one bug shape, one model and one small app. It cannot show that Tensium produces more correct code overall, and an outcome favourable to Tensium here would only show that this one bug needs a compiler rule, not that the rule needs a new language.
5. No task, test, starter, baseline or checker changes after any agent has run. If something turns out to be broken, I will say so, fix it and re-run every arm on the affected task, reporting both results.
6. Numbers come from the attempt logs and the hidden tests, not from what agents say about themselves.
