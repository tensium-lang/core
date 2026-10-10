<!-- This is one change request for the shop app: keeping a store notice on the server and showing it. (The experiment tool removes this note before showing it.) -->

Add a store notice.

- The notice text is kept on the server, in a new server function `storeNotice()`. Right now the notice is `Free shipping this week`.
- Add a client function `noticeText()` that gives back `Notice: ` followed by the notice, so `Notice: Free shipping this week`.
- The notice text itself must not appear in client code; the client has to ask the server for it.
