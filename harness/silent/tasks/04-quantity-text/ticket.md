<!-- This is one change request for the shop app: taking the quantity as text typed by the shopper. (The experiment tool removes this note before showing it.) -->

Shoppers type the quantity into a text box. Add a client function `quoteFromText(productId: number, quantityText: string, customerId: number)`.

- If `quantityText` is a whole number written with digits only (like `2` or `12`), it gives back exactly what `quoteSummary` gives for that product, quantity and customer.
- Anything else gives back `error: not a number`.
