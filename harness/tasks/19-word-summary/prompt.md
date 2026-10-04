<!-- This is the task description a helper reads: finding the first word of a sentence and describing it, when there might be no words. (The experiment tool removes this note before showing it.) -->

Write two functions:

1. `fn firstWord(s: string): string | null` — trim `s`; if what is left is empty return `null`; otherwise return the text up to (not including) the first space, or all of it if there is no space.
2. `fn wordSummary(s: string): Result<string, string>` — use `firstWord`. If it is `null`, return `err("no words")`. Otherwise return `ok(toUpper(<word>) + ":" + str(len(<word>)))`.
