// The part of the invoicing app that both the server and the client share: the record types
// (customers, invoices, payments and so on), the ids and money types that cannot be mixed up,
// money and date arithmetic, and the one function that may change an invoice's status.

#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

pub mod dates;
pub mod invoice;
pub mod money;
pub mod types;

pub use invoice::{transition, Invoice};
pub use types::*;
