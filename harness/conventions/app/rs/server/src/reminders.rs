// Reminder messages: the text of the email the business sends when an invoice is overdue,
// written on the server so the wording and the amounts come from one place.

use shared::money::format_cents;
use shared::{InvoiceId, Status};

use crate::data::{find_customer, find_invoice};
use crate::invoices::{days_overdue, due_on, totals_of};

pub fn reminder_text(id: InvoiceId) -> Result<String, String> {
    let inv = find_invoice(id).ok_or_else(|| "no such invoice".to_string())?;
    if inv.status() != Status::Sent {
        return Err("only a sent invoice can be reminded".to_string());
    }
    let c = find_customer(inv.customer_id).ok_or_else(|| "no such customer".to_string())?;
    let due = due_on(&inv)?;
    let late = days_overdue(&inv)?;
    let balance = format_cents(totals_of(&inv).balance_cents);
    if late == 0 {
        return Ok(format!("To: {}\nHello {}, invoice #{} for {} is due on {}.", c.email, c.name, inv.id.0, balance, due));
    }
    Ok(format!("To: {}\nHello {}, invoice #{} for {} was due on {} and is {} days overdue.", c.email, c.name, inv.id.0, balance, due, late))
}
