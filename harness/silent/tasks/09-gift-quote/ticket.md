<!-- This is one change request for the shop app: letting one customer buy a gift for another. (The experiment tool removes this note before showing it.) -->

Add gift orders: one customer buys for another.

- Add a server function `getGiftQuote(productId, quantity, buyerId, recipientId)`. It works like `getQuote`, except that the discount and the purchase limit come from the BUYER's tier, and the result also carries the recipient's name. It fails with `no such customer` if either customer does not exist.
- Add a client function `giftSummary(productId: number, quantity: number, recipientId: number, buyerId: number)`; note that the recipient comes first here, then the buyer. It gives text like `2 x Widget for Bo Chen = $20.00 (20% off)`: the recipient's name, and the price after the buyer's discount.

Example: Ann Lee (customer 1, gold) buying 2 Widgets for Bo Chen (customer 2) is `giftSummary(1, 2, 2, 1)` and gives `2 x Widget for Bo Chen = $20.00 (20% off)`.
