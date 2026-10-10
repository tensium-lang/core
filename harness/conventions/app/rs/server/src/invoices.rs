// The heart of the invoicing server: looking up invoices, working out what they add up to
// (subtotal, discount, tax, payments, credits and the balance still owed), when they are due,
// and whether a draft is complete enough to send. Status changes go through shared::transition.

use shared::dates::{add_days, days_between, is_after};
use shared::money::{add, percent_of, sub, sum_cents, times};
use shared::{Cents, Invoice, InvoiceId, Status, Totals};

use crate::clock::TODAY;
use crate::data::{credit_notes, find_customer, find_invoice, find_product, payments};

/// Sales tax, in basis points: 8 %. Charged on taxable products only.
pub const TAX_BASIS_POINTS: i64 = 800;

pub fn get_invoice(id: InvoiceId) -> Result<Invoice, String> {
    find_invoice(id).ok_or_else(|| "no such invoice".to_string())
}

pub fn subtotal_of(inv: &Invoice) -> Cents {
    sum_cents(&inv.lines.iter().map(|l| times(l.unit_cents, l.quantity)).collect::<Vec<_>>())
}

/// The part of the subtotal that tax applies to: lines whose product is taxable.
pub fn taxable_subtotal_of(inv: &Invoice) -> Cents {
    let mut total = Cents(0);
    for l in &inv.lines {
        if let Some(p) = find_product(l.product_id) {
            if p.taxable {
                total = add(total, times(l.unit_cents, l.quantity));
            }
        }
    }
    total
}

pub fn paid_on(id: InvoiceId) -> Cents {
    sum_cents(&payments().iter().filter(|p| p.invoice_id == id).map(|p| p.amount_cents).collect::<Vec<_>>())
}

pub fn credited_on(id: InvoiceId) -> Cents {
    sum_cents(&credit_notes().iter().filter(|c| c.invoice_id == id).map(|c| c.amount_cents).collect::<Vec<_>>())
}

pub fn totals_of(inv: &Invoice) -> Totals {
    let subtotal_cents = subtotal_of(inv);
    let discount_cents = percent_of(subtotal_cents, inv.discount_percent * 100);
    let tax_cents = percent_of(taxable_subtotal_of(inv), TAX_BASIS_POINTS);
    let total_cents = add(sub(subtotal_cents, discount_cents), tax_cents);
    let paid_cents = paid_on(inv.id);
    let credit_cents = credited_on(inv.id);
    Totals { subtotal_cents, discount_cents, tax_cents, total_cents, paid_cents, credit_cents, balance_cents: sub(sub(total_cents, paid_cents), credit_cents) }
}

pub fn invoice_totals(id: InvoiceId) -> Result<Totals, String> {
    let inv = get_invoice(id)?;
    Ok(totals_of(&inv))
}

/// The day payment is due: the customer's terms counted from the day the invoice was issued.
pub fn due_on(inv: &Invoice) -> Result<String, String> {
    let c = find_customer(inv.customer_id).ok_or_else(|| "no such customer".to_string())?;
    Ok(add_days(&inv.issued_on, c.terms_days))
}

/// Days past due as of today, or 0 if not overdue (only sent invoices can be overdue).
pub fn days_overdue(inv: &Invoice) -> Result<i64, String> {
    if inv.status() != Status::Sent {
        return Ok(0);
    }
    let due = due_on(inv)?;
    if !is_after(TODAY, &due) {
        return Ok(0);
    }
    Ok(days_between(&due, TODAY))
}

/// Checks that a draft invoice is complete enough to be sent to the customer.
pub fn ready_to_send(inv: &Invoice) -> Result<(), String> {
    if inv.lines.is_empty() {
        return Err("invoice has no lines".to_string());
    }
    for l in &inv.lines {
        if l.quantity < 1 {
            return Err("line quantity must be at least 1".to_string());
        }
        if find_product(l.product_id).is_none() {
            return Err("line refers to an unknown product".to_string());
        }
    }
    let c = find_customer(inv.customer_id).ok_or_else(|| "no such customer".to_string())?;
    if c.email.is_empty() {
        return Err("customer has no email address".to_string());
    }
    Ok(())
}
