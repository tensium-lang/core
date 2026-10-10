<!-- This is the task description a helper reads: adding up the digits in a piece of text, using a function that calls itself. (The experiment tool removes this note before showing it.) -->

Write `fn sumDigits(s: string): Result<number, string>`.

Return `ok(<sum of the digit characters in s>)`, e.g. `"123"` gives `ok(6)` and the empty string gives `ok(0)`. If ANY character is not a digit 0-9 (including `-` or a space), return `err(...)` (any message). There are no loops in Tensium, so use recursion (a helper function is fine).
