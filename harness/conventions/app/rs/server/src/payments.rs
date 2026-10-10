// Payments on the server: the payments already received for an invoice, and the rules for whether
// a new payment of a given size would be accepted.

use shared::money::sub;
use shared::{Cents, InvoiceId, Payment, Status};

use crate::data::{find_invoice, payments};
use crate::invoices::totals_of;

pub fn payments_for(id: InvoiceId) -> Result<Vec<Payment>, String> {
    find_invoice(id).ok_or_else(|| "no such invoice".to_string())?;
    Ok(payments().into_iter().filter(|p| p.invoice_id == id).collect())
}

/// Whether a payment of this size could be taken on the invoice as it stands; gives the balance left after it.
pub fn payment_allowed(id: InvoiceId, amount_cents: Cents) -> Result<Cents, String> {
    let inv = find_invoice(id).ok_or_else(|| "no such invoice".to_string())?;
    match inv.status() {
        Status::Draft => return Err("invoice has not been sent".to_string()),
        Status::Void => return Err("invoice is void".to_string()),
        Status::Paid => return Err("invoice is already paid".to_string()),
        Status::Sent => {}
    }
    if amount_cents.0 <= 0 {
        return Err("payment must be more than zero".to_string());
    }
    let balance = totals_of(&inv).balance_cents;
    if amount_cents.0 > balance.0 {
        return Err("payment exceeds balance".to_string());
    }
    Ok(sub(balance, amount_cents))
}
