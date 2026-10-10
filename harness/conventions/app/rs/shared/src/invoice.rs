// The invoice record, and the one function that is allowed to change its status. The status
// field is private to this file on purpose: everywhere else reads it with status() and changes it
// only through transition(), which knows which moves the business allows and stamps the dates.

use serde::{Deserialize, Serialize};

use crate::types::{CustomerId, InvoiceId, LineItem, Status};

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Invoice {
    pub id: InvoiceId,
    pub customer_id: CustomerId,
    pub issued_on: String,
    status: Status,
    pub lines: Vec<LineItem>,
    pub discount_percent: i64,
    pub notes: Option<String>,
    pub sent_on: Option<String>,
    pub paid_on: Option<String>,
}

impl Invoice {
    /// Builds an invoice record as it is stored. Changing the status of an existing invoice is
    /// done with transition(), not by building a new record.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        id: InvoiceId,
        customer_id: CustomerId,
        issued_on: &str,
        status: Status,
        lines: Vec<LineItem>,
        discount_percent: i64,
        notes: Option<&str>,
        sent_on: Option<&str>,
        paid_on: Option<&str>,
    ) -> Invoice {
        Invoice {
            id,
            customer_id,
            issued_on: issued_on.to_string(),
            status,
            lines,
            discount_percent,
            notes: notes.map(str::to_string),
            sent_on: sent_on.map(str::to_string),
            paid_on: paid_on.map(str::to_string),
        }
    }

    pub fn status(&self) -> Status {
        self.status
    }
}

/// Moves an invoice to its next status and stamps the date with `today`. This is the only place
/// a status may change: it refuses moves the business does not allow (paying a void invoice,
/// sending a paid one, ...).
pub fn transition(inv: &Invoice, next: Status, today: &str) -> Result<Invoice, String> {
    if inv.status == Status::Paid {
        return Err("invoice is already paid".to_string());
    }
    if inv.status == Status::Void {
        return Err("invoice is void".to_string());
    }
    match next {
        Status::Draft => Err("an invoice cannot go back to draft".to_string()),
        Status::Sent => {
            if inv.status == Status::Sent {
                return Err("invoice is already sent".to_string());
            }
            Ok(Invoice { status: Status::Sent, sent_on: Some(today.to_string()), ..inv.clone() })
        }
        Status::Paid => {
            if inv.status == Status::Draft {
                return Err("a draft invoice cannot be paid".to_string());
            }
            Ok(Invoice { status: Status::Paid, paid_on: Some(today.to_string()), ..inv.clone() })
        }
        Status::Void => Ok(Invoice { status: Status::Void, ..inv.clone() }),
    }
}
