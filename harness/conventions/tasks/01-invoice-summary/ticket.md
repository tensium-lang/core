<!-- This is one change request for the invoicing app: a one-line summary of an invoice. (The experiment tool removes this note before showing it.) -->

Add a one-line summary of an invoice.

- Add a server function the client can call, `invoiceSummary(invoiceId)`, that gives back the text `#<id> <customer name> <status> total <total> balance <balance>`, for example `#1 Ann Lee sent total $159.50 balance $59.50`. The status is the lowercase word (`draft`, `sent`, `paid`, `void`) and the amounts are formatted like everywhere else in the app.
- Add a client screen `summaryLine(invoiceId)` that shows that text, or `error: no such invoice` when there is no such invoice.
