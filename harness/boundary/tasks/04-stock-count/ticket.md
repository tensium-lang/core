<!-- This is one change request for the shop app: replacing the in-stock yes/no with a count of how many are left. (The experiment tool removes this note before showing it.) -->

Replace the `inStock` field of `Product` (a boolean) with `stockCount` (a number): Widget has 5, Gadget has 0, Gizmo has 2. Remove `inStock`.

- `canBuy` is true when at least one is left.
- The product label still ends with ` (sold out)` when none are left. When 1 or 2 are left it ends with ` (only 2 left)` (with the real number). Otherwise it has no ending.
- `getQuote` fails with `out of stock` when none are left, and with `only 2 left` (with the real number) when the quantity asked for is more than what is left.
