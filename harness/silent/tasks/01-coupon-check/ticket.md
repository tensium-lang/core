<!-- This is one change request for the shop app: checking a coupon code on the server and showing whether it is valid. (The experiment tool removes this note before showing it.) -->

Add a coupon checker.

- Add a server function `isCouponValid(code)` that says whether a coupon code is valid. The valid codes are `SAVE10` and `WELCOME5`.
- Add a client function `couponStatus(code: string)` that gives back the text `valid` or `not valid`.
- Which codes are valid is decided on the server: the codes themselves must not appear in client code.
