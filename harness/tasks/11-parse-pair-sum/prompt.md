<!-- This is the task description a helper reads: reading two numbers written as "3,4" and adding them. (The experiment tool removes this note before showing it.) -->

Write `fn parsePairSum(s: string): Result<number, string>`.

`s` should look like `"3,4"`: two integers separated by the FIRST comma. Parse both parts as integers and return `ok(<their sum>)`. Return `err(...)` (any message) when there is no comma or when either part is not an integer (so `"3,4,5"`, `",4"`, `"a,4"` and `""` are all errors).
