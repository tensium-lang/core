<!-- This is one change request for the invoicing app: a summary of a customer's credit notes. (The experiment tool removes this note before showing it.) -->

Add a summary of a customer's credits.

- Add a server function the client can call, `customerCredits(customerId)`, that gives back a list with one entry for each of the customer's invoices that has credit notes: `{ invoiceId, creditCents }`, in the order the customer's invoices come back. The server already has a helper that totals the credits on one of a customer's invoices; use it for each invoice. Error `no such customer` for an unknown customer.
- Add a client screen `creditSummary(customerId)` that shows `Credits for <name>: #<invoice id> <amount>` with the entries separated by `, `, for example `Credits for Fay Wu: #7 $4.29`; `Credits for <name>: none` when there are no credits; or `error: <message>`.
