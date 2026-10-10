# Conventions

These are the rules this codebase follows. Every change is expected to follow them.

1. **Every function the client can call returns a `Result`** (`ok(...)` or `err(...)`), never a bare value. A network call can fail, and the client reads `.ok` on everything it gets back.
2. **Errors are values.** Never `throw`, never panic, never `unwrap`. A function that can fail returns a `Result` with a short lowercase message such as `payment exceeds balance`.
3. **A `Result` is never ignored.** If you call something that returns a `Result`, check it. If it failed, pass the error on.
4. **The webhook secret never leaves the server.** Only server code reads `WEBHOOK_SECRET`, and only server code computes or checks signatures. The client asks the server.
5. **Nullable values are checked, never assumed.** No `!`, no `as` casts, no `unwrap`. If something is `| null`, handle the null.
6. **Ids are distinct types.** `CustomerId`, `InvoiceId` and `ProductId` are never passed where another is expected, even though they are all numbers underneath. Check parameter order when calling a helper.
7. **Money is integer cents.** Amounts are whole cents of type `Cents`. Never use floating point for money. All percentages go through `percentOf(amount, basisPoints)` in the money module, which rounds half to even; 1.5 % is 150 basis points.
8. **Status changes go through `transition`.** Never set an invoice's `status` yourself. `transition(invoice, next)` knows which changes are allowed and stamps the dates.
9. **The server recomputes totals.** It never trusts an amount, total or balance that the client sends; it works them out from its own data and compares.
10. **Every file starts with a comment** that says, in plain words a 5th grader could follow, what the file does.
