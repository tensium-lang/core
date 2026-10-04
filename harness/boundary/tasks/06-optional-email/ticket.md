<!-- This is one change request for the shop app: letting a customer have no email address. (The experiment tool removes this note before showing it.) -->

Not every customer has an email address any more. Make the `email` field of `Customer` optional (it can be null), and change customer 3 (Cy Young) to have no email.

- For a customer with no email the contact line is `Cy Young (no email)`. Customers who have one are shown as before.
- Add a new client function `hasEmail(customerId: number)` that gives back a boolean: true when the customer has an email, false when they don't, and false when there is no such customer.
