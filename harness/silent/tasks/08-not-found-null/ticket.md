<!-- This is one change request for the shop app: making a missing product an empty answer instead of an error. (The experiment tool removes this note before showing it.) -->

A missing product is not an error.

- `getProduct` should stop failing for an unknown id. When there is no product with that id it now answers ok with no product (null).
- `productLabel` gives `no such product` for an unknown id (without `error: ` in front).
- `canBuy` is still false for an unknown id.
- `getQuote` still fails with `no such product` for an unknown product, so `quoteSummary`, `availabilityText` and `receiptText` keep giving `error: no such product`.
