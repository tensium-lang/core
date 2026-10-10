// The aging report: how much of the money still owed is 1-30 days overdue, 31-60, 61-90 and
// more than 90 days, so the business can see which debts are getting old.

use shared::money::add;
use shared::{AgingBuckets, Cents, Status};

use crate::data::invoices;
use crate::invoices::{days_overdue, totals_of};

pub fn aging_report() -> Result<AgingBuckets, String> {
    let mut b = AgingBuckets { current: Cents(0), days1to30: Cents(0), days31to60: Cents(0), days61to90: Cents(0), over90: Cents(0) };
    for inv in invoices() {
        if inv.status() != Status::Sent {
            continue;
        }
        let late = days_overdue(&inv)?;
        let balance = totals_of(&inv).balance_cents;
        if late == 0 {
            b.current = add(b.current, balance);
        } else if late <= 30 {
            b.days1to30 = add(b.days1to30, balance);
        } else if late <= 60 {
            b.days31to60 = add(b.days31to60, balance);
        } else if late <= 90 {
            b.days61to90 = add(b.days61to90, balance);
        } else {
            b.over90 = add(b.over90, balance);
        }
    }
    Ok(b)
}
