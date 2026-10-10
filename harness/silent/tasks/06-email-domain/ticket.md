<!-- This is one change request for the shop app: showing the domain of a customer's email instead of the whole address. (The experiment tool removes this note before showing it.) -->

Show the email's domain instead of the full address.

- `contactLine` now gives the customer's name followed by the domain of their email (the part after the `@`) in brackets: `Ann Lee (example.com)`.
- Bo Chen's email changes to `bo@mail.shop.org`, so his contact line is `Bo Chen (mail.shop.org)`.
- Add customer 4: Dee Ray, tier `basic`, whose email on file is `dee.example.com` (it has no `@`). An email with no `@` is shown as `Dee Ray (invalid email)`.
