// Customer lookups for the server: one customer by id, a product by id, and the invoices that
// belong to a customer.

use shared::{Customer, CustomerId, Invoice, InvoiceId, Product, ProductId};

use crate::data::{find_customer, find_invoice, find_product, invoices};

pub fn get_customer(id: CustomerId) -> Result<Customer, String> {
    find_customer(id).ok_or_else(|| "no such customer".to_string())
}

pub fn get_product(id: ProductId) -> Result<Product, String> {
    find_product(id).ok_or_else(|| "no such product".to_string())
}

pub fn customer_invoices(customer_id: CustomerId) -> Result<Vec<Invoice>, String> {
    find_customer(customer_id).ok_or_else(|| "no such customer".to_string())?;
    Ok(invoices().into_iter().filter(|i| i.customer_id == customer_id).collect())
}

/// True when the invoice exists and belongs to the customer.
pub fn invoice_belongs_to(invoice_id: InvoiceId, customer_id: CustomerId) -> bool {
    find_invoice(invoice_id).map(|inv| inv.customer_id == customer_id).unwrap_or(false)
}
