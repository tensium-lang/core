<!-- This is the task description a helper reads: turning text into a whole number that is zero or bigger. (The experiment tool removes this note before showing it.) -->

Write `fn parseNonNegative(s: string): Result<number, string>`.

Parse `s` as an integer. Return `ok(n)` when it is an integer that is 0 or greater. Return `err(...)` (any message) when `s` is not an integer or is negative.
