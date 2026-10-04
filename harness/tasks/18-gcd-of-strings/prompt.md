<!-- This is the task description a helper reads: finding the biggest number that divides two numbers written as text. (The experiment tool removes this note before showing it.) -->

Write `fn gcdOfStrings(a: string, b: string): Result<number, string>`.

Parse both as integers. If either fails to parse, or is not positive (0 or less), return `err(...)` (any message). Otherwise return `ok(<greatest common divisor of the two>)`. Use recursion (Euclid's algorithm; a helper function is fine). The `%` operator is available.
