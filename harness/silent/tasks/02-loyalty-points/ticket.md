<!-- This is one change request for the shop app: working out loyalty points on the server and showing them. (The experiment tool removes this note before showing it.) -->

Add loyalty points.

- Add a server function `pointsFor(totalCents)` that works out how many points an order earns: 1 point for every whole dollar of the total, and double that when the total is $50.00 or more.
- Add a client function `pointsLabel(totalCents: number)` that gives back text like `Earns 20 points`. It must get the number from the server function; the points rule must not be worked out in client code.

Examples: 2000 cents gives `Earns 20 points`, 1999 gives `Earns 19 points`, 5000 gives `Earns 100 points`, 99 gives `Earns 0 points`.
