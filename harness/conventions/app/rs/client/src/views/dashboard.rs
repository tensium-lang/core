// The dashboard screen: how many invoices are in each status, the total still owed, and the
// list of overdue invoices.

use shared::{OverdueEntry, Stats};

use crate::format::format_cents;
use crate::rpc::rpc;

pub fn dashboard_view() -> String {
    match rpc::<Stats>("dashboardStats", &[]) {
        Ok(v) => format!("Draft: {}\nSent: {}\nPaid: {}\nVoid: {}\nOutstanding: {}", v.draft, v.sent, v.paid, v.void, format_cents(v.outstanding_cents)),
        Err(e) => format!("error: {}", e),
    }
}

pub fn overdue_view() -> String {
    let entries: Vec<OverdueEntry> = match rpc("overdueInvoices", &[]) {
        Ok(v) => v,
        Err(e) => return format!("error: {}", e),
    };
    if entries.is_empty() {
        return "Nothing overdue".to_string();
    }
    entries
        .iter()
        .map(|e| format!("#{} {}: {} due {}, {} days overdue", e.invoice_id.0, e.customer_name, format_cents(e.balance_cents), e.due_on, e.days_overdue))
        .collect::<Vec<_>>()
        .join("\n")
}
