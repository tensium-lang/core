<!-- This is the task description a helper reads: checking a name and an age together, using a helper function that can fail. (The experiment tool removes this note before showing it.) -->

Write two functions:

1. `fn parseAge(s: string): Result<number, string>` — parse `s` as an integer from 0 to 150 inclusive. Not an integer, or outside that range: `err("bad age")`.
2. `fn validateUser(name: string, age: string): Result<string, string>` — first, if `trim(name)` is empty return `err("empty name")`. Then parse `age` with `parseAge` (propagate its error). On success return `ok(trim(name) + ":" + str(<age number>))`.
