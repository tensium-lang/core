// The customer screen: who the customer is, their payment terms, and a one-line summary of each
// of their invoices with what is still owed.

use serde_json::json;
use shared::money::add;
use shared::{Cents, Customer, Invoice, Status, Totals};

use crate::format::{format_cents, status_word};
use crate::rpc::rpc;

pub fn customer_view(customer_id: i64) -> String {
    let c: Customer = match rpc("getCustomer", &[json!(customer_id)]) {
        Ok(v) => v,
        Err(e) => return format!("error: {}", e),
    };
    let invoices: Vec<Invoice> = match rpc("customerInvoices", &[json!(customer_id)]) {
        Ok(v) => v,
        Err(e) => return format!("error: {}", e),
    };
    let mut lines: Vec<String> = Vec::new();
    lines.push(format!("{} <{}>", c.name, c.email));
    lines.push(format!("Terms: net {}", c.terms_days));
    lines.push(format!("Region: {}", c.region));
    let mut owed = Cents(0);
    for inv in &invoices {
        let t: Totals = match rpc("invoiceTotals", &[json!(inv.id)]) {
            Ok(v) => v,
            Err(e) => return format!("error: {}", e),
        };
        let balance = if inv.status() == Status::Sent { t.balance_cents } else { Cents(0) };
        owed = add(owed, balance);
        lines.push(format!("  #{} {} {} total {} balance {}", inv.id.0, inv.issued_on, status_word(inv.status()), format_cents(t.total_cents), format_cents(balance)));
    }
    lines.push(format!("Outstanding: {}", format_cents(owed)));
    lines.join("\n")
}

/// "Ann Lee <ann@example.com>" for a customer.
pub fn contact_line(customer_id: i64) -> String {
    match rpc::<Customer>("getCustomer", &[json!(customer_id)]) {
        Ok(c) => format!("{} <{}>", c.name, c.email),
        Err(e) => format!("error: {}", e),
    }
}
