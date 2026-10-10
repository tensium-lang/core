<!-- This is one change request for the invoicing app: recording a payment against an invoice. (The experiment tool removes this note before showing it.) -->

Add a way to record a payment.

- Add a server function the client can call, `recordPayment(invoiceId, amountCents, method)`. The app does not store changes (it is a calculator over fixed data), so the function checks the payment and gives back what it would mean: `{ invoiceId, amountCents, balanceAfterCents }`.
- The rules for whether a payment can be taken already exist on the server; use them. The reasons a payment is refused, with their exact messages, are: `no such invoice`, `invoice has not been sent` (a draft), `invoice is void`, `invoice is already paid`, `payment must be more than zero`, and `payment exceeds balance` (more than what is still owed).
- Add a client screen `paymentResult(invoiceId, amountCents, method)` that shows `Payment of <amount> recorded on #<id>; balance now <balance>`, for example `Payment of $59.50 recorded on #1; balance now $0.00`, or `error: <message>` when the payment is refused.
