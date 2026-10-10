<!-- This is the task description a helper reads: turning a test score typed as text into a letter grade. (The experiment tool removes this note before showing it.) -->

Write `fn parseGrade(s: string): Result<string, string>`.

Parse `s` as an integer score. If it is not an integer, or is outside 0..100 inclusive, return `err(...)` (any message). Otherwise return `ok(letter)` where letter is `"A"` for 90 and above, `"B"` for 80-89, `"C"` for 70-79, and `"F"` for anything below 70.
