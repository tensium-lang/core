<!-- This is the task description a helper reads: working out a percentage from two numbers written as text. (The experiment tool removes this note before showing it.) -->

Write `fn percent(part: string, whole: string): Result<number, string>`.

Parse both strings as integers. If either fails to parse, return `err(...)` (any message). If `whole` is 0, return `err(...)`. Otherwise return `ok(floor(part * 100 / whole))`.
