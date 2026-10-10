// The record types the server and client both use, and the ids and money type that the compiler
// keeps apart: a Cents is never a plain number, and a CustomerId is never an InvoiceId.

use serde::{Deserialize, Serialize};

/// Whole cents. See CONTRIBUTING.md: money is never a float.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug, Default)]
#[serde(transparent)]
pub struct Cents(pub i64);

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(transparent)]
pub struct CustomerId(pub i64);

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(transparent)]
pub struct ProductId(pub i64);

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(transparent)]
pub struct InvoiceId(pub i64);

/// The life of an invoice: draft -> sent -> paid, or draft/sent -> void.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Draft,
    Sent,
    Paid,
    Void,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    pub id: CustomerId,
    pub name: String,
    pub email: String,
    pub phone: Option<String>,
    /// Payment terms: the invoice is due this many days after it is issued.
    pub terms_days: i64,
    pub region: String,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: ProductId,
    pub name: String,
    pub unit_cents: Cents,
    pub taxable: bool,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LineItem {
    pub product_id: ProductId,
    pub quantity: i64,
    pub unit_cents: Cents,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Payment {
    pub invoice_id: InvoiceId,
    pub amount_cents: Cents,
    pub received_on: String,
    pub method: String,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreditNote {
    pub id: i64,
    pub invoice_id: InvoiceId,
    pub amount_cents: Cents,
    pub reason: String,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub subtotal_cents: Cents,
    pub discount_cents: Cents,
    pub tax_cents: Cents,
    pub total_cents: Cents,
    pub paid_cents: Cents,
    pub credit_cents: Cents,
    pub balance_cents: Cents,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OverdueEntry {
    pub invoice_id: InvoiceId,
    pub customer_name: String,
    pub due_on: String,
    pub days_overdue: i64,
    pub balance_cents: Cents,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub draft: i64,
    pub sent: i64,
    pub paid: i64,
    pub void: i64,
    pub outstanding_cents: Cents,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub invoice_id: InvoiceId,
    pub total_cents: Cents,
    pub paid_cents: Cents,
    pub signature: String,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AgingBuckets {
    pub current: Cents,
    pub days1to30: Cents,
    pub days31to60: Cents,
    pub days61to90: Cents,
    pub over90: Cents,
}
