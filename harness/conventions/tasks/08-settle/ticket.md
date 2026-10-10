<!-- This is one change request for the invoicing app: settling an invoice with a payment. (The experiment tool removes this note before showing it.) -->

Add a way to settle an invoice.

- Add a server function the client can call, `settle(invoiceId, amountCents)`. It takes a payment under the same rules as any payment (the server already has them; their messages are the error messages, for example `payment exceeds balance`), and if the payment brings the balance to zero the invoice becomes paid. The app does not store changes (it is a calculator over fixed data), so the function gives back the invoice as it would be after the payment.
- Add a client screen `settleResult(invoiceId, amountCents)` that shows `Invoice #<id> paid in full on <date>` when the invoice is now paid, for example `Invoice #1 paid in full on 2026-10-01`; `Invoice #<id> now has a balance of <amount>` when something is still owed; or `error: <message>`.
