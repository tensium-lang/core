<!-- This is one change request for the shop app: making the purchase limit say what the limit is. (The experiment tool removes this note before showing it.) -->

The purchase limit should explain itself.

- Change the helper `withinLimit(quantity, tier)` so that instead of a yes/no answer it gives back a Result: ok when the quantity is within that tier's limit, and otherwise an error with a message like `limit is 5 per order` (with that tier's real limit: 5, 10 or 20).
- `getQuote` must fail with that message instead of `over the limit`. Example: `quoteSummary(1, 6, 3)` gives `error: limit is 5 per order`.
- `availabilityText` does not change: it still gives `over the limit` when the quantity is over the customer's limit, and `available` when it is not.
