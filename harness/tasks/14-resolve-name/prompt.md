<!-- This is the task description a helper reads: picking the best name to show when some names may be missing. (The experiment tool removes this note before showing it.) -->

Write `fn resolveName(nick: string | null, first: string | null, last: string | null): string`.

Rules, in order:
1. If `nick` is not null and not the empty string, return `nick`.
2. Otherwise, if both `first` and `last` are not null, return `first + " " + last`.
3. Otherwise, if `first` is not null, return `first`.
4. Otherwise, if `last` is not null, return `last`.
5. Otherwise return `"unknown"`.
