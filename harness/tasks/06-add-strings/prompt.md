<!-- This is the task description a helper reads: adding two numbers that were written as text. (The experiment tool removes this note before showing it.) -->

Write `fn addStrings(a: string, b: string): Result<number, string>`.

Parse both strings as integers and return `ok(<their sum>)`. If either one is not an integer, return `err(...)` (any message).
