<!-- This is one change request for the invoicing app: a revenue report by month. (The experiment tool removes this note before showing it.) -->

Add a revenue report by month.

- Add a server function the client can call, `revenueByMonth()`, that gives back one entry per month in which at least one invoice was paid (by its paid date): `{ month, paidCents }` where `month` is `YYYY-MM` and `paidCents` is the sum of those invoices' totals; oldest month first.
- Add a client screen `revenueView()` that shows one line per month: `<month>: <amount>`, for example `2026-04: $600.00`.
- If the app has separate files, put the server part of this in a file of its own and the client part in a file of its own.
