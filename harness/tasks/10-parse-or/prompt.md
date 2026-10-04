<!-- This is the task description a helper reads: turning text into a number, or using a backup number when that fails. (The experiment tool removes this note before showing it.) -->

Write `fn parseOr(s: string, fallback: number): number`.

Parse `s` as an integer and return it. If `s` is not an integer, return `fallback`. This function itself must NOT return a Result — handle the failure inside it.
