<!-- This is the task description a helper reads: turning text like "101" (binary) into a number, using a function that calls itself. (The experiment tool removes this note before showing it.) -->

Write `fn parseBinary(s: string): Result<number, string>`.

`s` is a string of `0` and `1` characters read as a binary number, so `"101"` gives `ok(5)` and `"0010"` gives `ok(2)`. Return `err(...)` (any message) when `s` is empty or contains any other character. There are no loops, so use recursion (a helper function is fine).
