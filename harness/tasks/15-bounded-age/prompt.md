<!-- This is the task description a helper reads: turning text into an age and giving clear error messages. (The experiment tool removes this note before showing it.) -->

Write `fn parseBoundedAge(s: string): Result<number, string>`.

Parse `s` as an integer. If parsing fails, return `err("invalid age: " + <the parse error message>)`. If it parses but is below 0 or above 150, return `err("out of range")`. Otherwise return `ok(<the number>)`.
