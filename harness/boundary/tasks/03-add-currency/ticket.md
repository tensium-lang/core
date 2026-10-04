<!-- This is one change request for the shop app: adding a currency to every product and showing it next to every amount of money. (The experiment tool removes this note before showing it.) -->

The shop is starting to sell in euros. Add a `currency` field (a string) to `Product`: product 1 (Widget) is `"USD"`, and products 2 (Gadget) and 3 (Gizmo) are `"EUR"`.

Every amount of money shown to a shopper must now be written as the amount followed by the product's currency code, with no `$` sign:

- `Widget - 12.50 USD`, `Gadget - 99.99 EUR (sold out)`
- `2 x Widget = 20.00 USD (20% off)`
- `Receipt for Ann Lee: 2 x Widget, total 20.00 USD [...]`
