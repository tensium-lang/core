<!-- This is the task description a helper reads: checking that something looks like an email address. (The experiment tool removes this note before showing it.) -->

Write `fn validateEmail(s: string): Result<string, string>`.

Trim `s` and lowercase it, then validate it. On success return `ok(<the trimmed, lowercased address>)`. Otherwise return `err(...)` (any message). An address is valid when ALL of these hold:
- it contains an `@` that is not the first character,
- the part after the first `@` (the domain) contains a `.`,
- that `.` is neither the first nor the last character of the domain.
