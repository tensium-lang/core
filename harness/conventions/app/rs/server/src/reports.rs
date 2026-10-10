// Reports for the dashboard: how many invoices are in each status, how much is still owed in
// total, and the list of overdue invoices with how late each one is.

use shared::money::add;
use shared::{Cents, OverdueEntry, Stats, Status};

use crate::data::{find_customer, invoices};
use crate::invoices::{days_overdue, due_on, totals_of};

pub fn dashboard_stats() -> Result<Stats, String> {
    let mut s = Stats { draft: 0, sent: 0, paid: 0, void: 0, outstanding_cents: Cents(0) };
    for inv in invoices() {
        match inv.status() {
            Status::Draft => s.draft += 1,
            Status::Sent => {
                s.sent += 1;
                s.outstanding_cents = add(s.outstanding_cents, totals_of(&inv).balance_cents);
            }
            Status::Paid => s.paid += 1,
            Status::Void => s.void += 1,
        }
    }
    Ok(s)
}

/// Sent invoices past their due date, oldest due date first.
pub fn overdue_invoices() -> Result<Vec<OverdueEntry>, String> {
    let mut out: Vec<OverdueEntry> = Vec::new();
    for inv in invoices() {
        let late = days_overdue(&inv)?;
        if late == 0 {
            continue;
        }
        let due = due_on(&inv)?;
        let c = find_customer(inv.customer_id).ok_or_else(|| "no such customer".to_string())?;
        out.push(OverdueEntry { invoice_id: inv.id, customer_name: c.name, due_on: due, days_overdue: late, balance_cents: totals_of(&inv).balance_cents });
    }
    out.sort_by(|a, b| a.due_on.cmp(&b.due_on));
    Ok(out)
}
