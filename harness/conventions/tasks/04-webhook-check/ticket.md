<!-- This is one change request for the invoicing app: letting the client check whether a webhook payload is genuine. (The experiment tool removes this note before showing it.) -->

Add a way for the client to check whether a webhook payload is genuine.

- A webhook payload for an invoice carries the invoice id, the paid amount in cents, and a signature. A genuine signature is the signature of `<invoice id>:<total cents>:<paid cents>` made with the webhook secret, the same scheme the app already uses for signed receipts. The paid cents in the payload must match what the server knows, and the signature must match.
- Add a client screen `webhookStatus(invoiceId, paidCents, signature)` that shows `genuine` or `forged`. For an invoice that cannot have a receipt the screen shows `error: <message>`, with the same messages the signed receipt gives (`no such invoice`, `invoice has not been sent`, `invoice is void`).
- Add whatever the server needs for this. The webhook secret stays on the server.
