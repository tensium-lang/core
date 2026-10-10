<!-- This is one change request for the invoicing app: showing the customer's phone number. (The experiment tool removes this note before showing it.) -->

Show the customer's phone number.

- On the invoice screen (`invoiceView`), add a line `Phone: <number>` right after the `Status:` line.
- On the customer screen (`customerView`), add a line `Phone: <number>` right after the `Terms:` line.
- Customers who have no phone number show `Phone: (none)` in both places.
