<!-- This is the task description a helper reads: counting the steps of the Collatz game, using a function that calls itself. (The experiment tool removes this note before showing it.) -->

Write `fn collatzSteps(n: number): Result<number, string>`.

`n` is a whole number. If `n < 1`, return `err(...)` (any message). Otherwise count how many steps it takes to reach 1, where one step is: if the number is even, halve it; if it is odd, replace it with `3 * n + 1`. `collatzSteps(1)` is `ok(0)` and `collatzSteps(6)` is `ok(8)`. There are no loops, so use recursion (a helper function is fine).
