<!-- This is one change request for the shop app: looking up the shipping cost for a region. (The experiment tool removes this note before showing it.) -->

Add shipping costs.

- Add a server function `shippingCents(region)`. Shipping costs 499 cents to `US`, 899 cents to `EU` and 799 cents to `UK`. Any other region is an error with the message `unknown region`.
- Add a client function `shippingLabel(region: string)` that gives back text like `Shipping to EU: $8.99`, or `error: unknown region`.
