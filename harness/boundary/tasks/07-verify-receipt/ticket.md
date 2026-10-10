<!-- This is one change request for the shop app: adding a way to check that a receipt's signature is real, without giving the signing key to the client. (The experiment tool removes this note before showing it.) -->

Support staff need to check whether a receipt is real. Add a new client function:

`receiptIsValid(productId: number, quantity: number, customerId: number, signature: string)` gives back a boolean. It is true only when `signature` is exactly the signature that `checkout` produces for that product, quantity and customer. It is false for any other signature, and false whenever that purchase could not be checked out at all (for example, out of stock or no such customer).

The signing key must never be sent to the client or appear in client code.
