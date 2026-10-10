<!-- This is one change request for the invoicing app: sending a draft invoice to the customer. (The experiment tool removes this note before showing it.) -->

Add a way to send a draft invoice.

- Add a server function the client can call, `sendInvoice(invoiceId)`. The app does not store changes (it is a calculator over fixed data), so the function gives back the invoice as it would be once sent.
- The server already has a check for whether a draft is complete enough to send (it says, for example, `line quantity must be at least 1`), and it already has the way an invoice moves from one status to the next (which says, for example, `invoice is already sent`). Use both; the messages they give are the error messages.
- Add a client screen `sendResult(invoiceId)` that shows `Invoice #<id> sent on <date>`, for example `Invoice #4 sent on 2026-10-01`, or `error: <message>`.
