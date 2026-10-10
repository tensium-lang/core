// Signed receipts and webhook signatures. The server holds the secret and uses it to sign a short
// message about an invoice, so anyone who gets the receipt later can check it was not made up.
// The secret itself is read here and nowhere else.

use hmac::{Hmac, Mac};
use sha2::Sha256;
use shared::{InvoiceId, Receipt, Status};

use crate::data::find_invoice;
use crate::invoices::totals_of;

fn secret() -> String {
    std::env::var("WEBHOOK_SECRET").unwrap_or_default()
}

/// The first 16 hex characters of an HMAC-SHA256 of the message.
pub fn signature(message: &str) -> Result<String, String> {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret().as_bytes()).map_err(|e| e.to_string())?;
    mac.update(message.as_bytes());
    let hex: String = mac.finalize().into_bytes().iter().map(|b| format!("{:02x}", b)).collect();
    Ok(hex.chars().take(16).collect())
}

/// A receipt for a sent or paid invoice, signed as "<invoice id>:<total>:<paid>".
pub fn signed_receipt(id: InvoiceId) -> Result<Receipt, String> {
    let inv = find_invoice(id).ok_or_else(|| "no such invoice".to_string())?;
    match inv.status() {
        Status::Draft => return Err("invoice has not been sent".to_string()),
        Status::Void => return Err("invoice is void".to_string()),
        Status::Sent | Status::Paid => {}
    }
    let t = totals_of(&inv);
    let signature = signature(&format!("{}:{}:{}", inv.id.0, t.total_cents.0, t.paid_cents.0))?;
    Ok(Receipt { invoice_id: inv.id, total_cents: t.total_cents, paid_cents: t.paid_cents, signature })
}
