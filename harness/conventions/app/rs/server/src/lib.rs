// The invoicing server as a library: every module the server is made of, so that the program in
// main.rs only has to start it. Keeping the modules here means a helper that no screen uses yet is
// still a normal part of the server, ready for the next feature.

#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

pub mod aging;
pub mod catalog;
pub mod clock;
pub mod credits;
pub mod customers;
pub mod data;
pub mod invoices;
pub mod payments;
pub mod reminders;
pub mod reports;
pub mod rpc;
pub mod webhooks;
