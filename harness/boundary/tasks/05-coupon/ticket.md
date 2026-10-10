<!-- This is one change request for the shop app: adding a coupon code to quotes and checkout. (The experiment tool removes this note before showing it.) -->

Add coupon codes.

- On the server, `getQuote` and `checkout` take a new argument `coupon` (a string) placed right after `quantity`, so the order is: `productId, quantity, coupon, customerId`.
- The coupon `"SAVE10"` gives 10 more percentage points off on top of the customer's tier discount (gold 30%, silver 20%, everyone else 10%). The empty string `""` means no coupon. Any other code fails with the error `unknown coupon`.
- On the client, `quoteSummary` and `receiptText` take the coupon as a new LAST parameter, so their order is: `productId, quantity, customerId, coupon`.

Example: `quoteSummary(1, 2, 1, "SAVE10")` gives `2 x Widget = $17.50 (30% off)`.
