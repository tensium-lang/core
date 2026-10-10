<!-- This is the task description a helper reads: averaging three numbers typed as text and saying which one was bad. (The experiment tool removes this note before showing it.) -->

Write `fn averageOfThree(a: string, b: string, c: string): Result<number, string>`.

Parse all three as integers and return `ok(floor((a + b + c) / 3))`. If one fails to parse, return `err("bad a")`, `err("bad b")` or `err("bad c")` naming the FIRST one (in the order a, b, c) that is not an integer.
