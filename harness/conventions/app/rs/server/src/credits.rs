// Credit notes on the server: money the business has agreed to take off an invoice (for damaged
// goods, late delivery and so on), and the total credited on an invoice.

use shared::{Cents, CreditNote, CustomerId, InvoiceId};

use crate::customers::invoice_belongs_to;
use crate::data::{credit_notes, find_invoice};
use crate::invoices::credited_on;

pub fn credits_for(id: InvoiceId) -> Result<Vec<CreditNote>, String> {
    find_invoice(id).ok_or_else(|| "no such invoice".to_string())?;
    Ok(credit_notes().into_iter().filter(|c| c.invoice_id == id).collect())
}

/// The total credited on one of a customer's invoices. The customer id is checked first so a
/// customer can only ever see credits on their own invoices.
pub fn credit_total(customer_id: CustomerId, invoice_id: InvoiceId) -> Result<Cents, String> {
    if !invoice_belongs_to(invoice_id, customer_id) {
        return Err("invoice does not belong to customer".to_string());
    }
    Ok(credited_on(invoice_id))
}
