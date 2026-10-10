// The invoice screen: asks the server for an invoice, its customer, its products and its totals,
// and lays them out as the lines of text a person sees. Also the product label, the signed
// receipt line and the reminder preview.

use serde_json::json;
use shared::money::times;
use shared::{Customer, Invoice, Product, Receipt, Totals};

use crate::format::{discount_note, format_cents, status_word};
use crate::rpc::rpc;

pub fn invoice_view(invoice_id: i64) -> String {
    let inv: Invoice = match rpc("getInvoice", &[json!(invoice_id)]) {
        Ok(v) => v,
        Err(e) => return format!("error: {}", e),
    };
    let cust: Customer = match rpc("getCustomer", &[json!(inv.customer_id)]) {
        Ok(v) => v,
        Err(e) => return format!("error: {}", e),
    };
    let t: Totals = match rpc("invoiceTotals", &[json!(invoice_id)]) {
        Ok(v) => v,
        Err(e) => return format!("error: {}", e),
    };
    let mut lines: Vec<String> = Vec::new();
    lines.push(format!("Invoice #{} for {}", inv.id.0, cust.name));
    lines.push(format!("Status: {}", status_word(inv.status())));
    lines.push(format!("Issued: {}", inv.issued_on));
    for l in &inv.lines {
        let name = match rpc::<Product>("getProduct", &[json!(l.product_id)]) {
            Ok(p) => p.name,
            Err(_) => format!("product #{}", l.product_id.0),
        };
        lines.push(format!("  {} x {} @ {} = {}", l.quantity, name, format_cents(l.unit_cents), format_cents(times(l.unit_cents, l.quantity))));
    }
    lines.push(format!("Subtotal: {}", format_cents(t.subtotal_cents)));
    if t.discount_cents.0 != 0 {
        lines.push(format!("Discount{}: -{}", discount_note(inv.discount_percent), format_cents(t.discount_cents)));
    }
    lines.push(format!("Tax: {}", format_cents(t.tax_cents)));
    lines.push(format!("Total: {}", format_cents(t.total_cents)));
    if t.paid_cents.0 != 0 {
        lines.push(format!("Paid: {}", format_cents(t.paid_cents)));
    }
    if t.credit_cents.0 != 0 {
        lines.push(format!("Credits: {}", format_cents(t.credit_cents)));
    }
    lines.push(format!("Balance: {}", format_cents(t.balance_cents)));
    if let Some(notes) = &inv.notes {
        lines.push(format!("Notes: {}", notes));
    }
    lines.join("\n")
}

/// One line per product: "Widget - $12.50" with "(taxable)" when tax applies.
pub fn product_label(product_id: i64) -> String {
    match rpc::<Product>("getProduct", &[json!(product_id)]) {
        Ok(p) => format!("{} - {}{}", p.name, format_cents(p.unit_cents), if p.taxable { " (taxable)" } else { "" }),
        Err(e) => format!("error: {}", e),
    }
}

/// The signed receipt for an invoice, as one line.
pub fn receipt_line(invoice_id: i64) -> String {
    match rpc::<Receipt>("signedReceipt", &[json!(invoice_id)]) {
        Ok(r) => format!("Receipt #{}: total {}, paid {} [{}]", r.invoice_id.0, format_cents(r.total_cents), format_cents(r.paid_cents), r.signature),
        Err(e) => format!("error: {}", e),
    }
}

/// The reminder email the server would send, as text.
pub fn reminder_preview(invoice_id: i64) -> String {
    match rpc::<String>("reminderText", &[json!(invoice_id)]) {
        Ok(text) => text,
        Err(e) => format!("error: {}", e),
    }
}
