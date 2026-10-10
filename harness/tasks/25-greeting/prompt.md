<!-- This is the task description a helper reads: building a greeting when the first or last name might be missing. (The experiment tool removes this note before showing it.) -->

Write `fn greeting(first: string | null, last: string | null): string`.

It gives back `"Hello, "` followed by the names that are present, separated by one space. So `"Hello, Ann Lee"`, `"Hello, Ann"` (no last name), `"Hello, Lee"` (no first name). If both are missing it gives back `"Hello, stranger"`.
