<!-- This is one change request for the shop app: splitting the customer's name into a first name and a last name. (The experiment tool removes this note before showing it.) -->

Customers should have separate `firstName` and `lastName` fields instead of the single `name` field (remove `name`). The customers are Ann Lee, Bo Chen and Cy Young.

- The greeting should now use only the first name: `Hello, Ann (gold)`.
- The contact line and the receipt still show the full name: `Ann Lee <ann@example.com>`, `Receipt for Ann Lee: ...`.
