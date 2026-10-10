// The invoicing server program. It knows the customers, products, invoices, payments and credit
// notes, works out what each invoice adds up to and when it is due, writes reminder messages,
// signs receipts with a secret, and answers the client's requests over HTTP.

#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

fn main() -> Result<(), String> {
    let port = std::env::args().nth(1).unwrap_or_else(|| "0".to_string());
    server::rpc::serve(&port)
}
