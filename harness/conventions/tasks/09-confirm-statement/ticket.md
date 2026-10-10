<!-- This is one change request for the invoicing app: confirming a customer statement. (The experiment tool removes this note before showing it.) -->

Add a way to confirm a customer's statement.

- When a statement is shown to a customer, the client sends back the outstanding total it displayed so the server can confirm nothing has changed in the meantime.
- Add a server function the client can call, `confirmStatement(customerId, outstandingCents)`. The server works out the customer's outstanding total (the balance of their sent invoices, as the customer screen shows it) and confirms only if it equals the amount sent: it gives back `{ customerId, outstandingCents }`. If it does not match, the error is `outstanding has changed: expected <amount>`, for example `outstanding has changed: expected $84.34`. Error `no such customer` for an unknown customer.
- Add a client screen `confirmStatementResult(customerId, outstandingCents)` that shows `Statement for <name> confirmed at <amount>`, or `error: <message>`.
