// The server's data: the customers, products, invoices, payments and credit notes it knows about.
// This is a fixed set that stands in for a database, so the app behaves the same every time.

use shared::{Cents, CreditNote, Customer, CustomerId, Invoice, InvoiceId, LineItem, Payment, Product, ProductId, Status};

fn customer(id: i64, name: &str, email: &str, phone: Option<&str>, terms_days: i64, region: &str) -> Customer {
    Customer { id: CustomerId(id), name: name.to_string(), email: email.to_string(), phone: phone.map(str::to_string), terms_days, region: region.to_string() }
}

pub fn customers() -> Vec<Customer> {
    vec![
        customer(1, "Ann Lee", "ann@example.com", Some("555-0101"), 30, "east"),
        customer(2, "Bo Chen", "bo@example.com", None, 15, "west"),
        customer(3, "Cy Young", "cy@example.com", Some("555-0103"), 30, "east"),
        customer(4, "Di Park", "di@example.com", None, 45, "north"),
        customer(5, "Ed Ruiz", "ed@example.com", Some("555-0105"), 30, "west"),
        customer(6, "Fay Wu", "fay@example.com", None, 15, "south"),
        customer(7, "Gus Hale", "gus@example.com", Some("555-0107"), 60, "east"),
        customer(8, "Ivy Noor", "ivy@example.com", None, 30, "north"),
    ]
}

fn product(id: i64, name: &str, unit_cents: i64, taxable: bool) -> Product {
    Product { id: ProductId(id), name: name.to_string(), unit_cents: Cents(unit_cents), taxable }
}

pub fn products() -> Vec<Product> {
    vec![
        product(1, "Widget", 1250, true),
        product(2, "Gadget", 9999, true),
        product(3, "Gizmo", 500, true),
        product(4, "Consulting hour", 15000, false),
        product(5, "Support plan", 4900, false),
        product(6, "Cable", 799, true),
        product(7, "Manual", 2500, false),
        product(8, "Bracket", 325, true),
        product(9, "Installation", 22000, false),
        product(10, "Sticker pack", 150, true),
        product(11, "Training day", 80000, false),
        product(12, "Spare part", 1799, true),
    ]
}

fn line(product_id: i64, quantity: i64, unit_cents: i64) -> LineItem {
    LineItem { product_id: ProductId(product_id), quantity, unit_cents: Cents(unit_cents) }
}

pub fn invoices() -> Vec<Invoice> {
    vec![
        Invoice::new(InvoiceId(1), CustomerId(1), "2026-08-01", Status::Sent, vec![line(1, 2, 1250), line(4, 1, 15000)], 10, Some("Thanks for the referral"), Some("2026-08-01"), None),
        Invoice::new(InvoiceId(2), CustomerId(2), "2026-09-20", Status::Sent, vec![line(2, 1, 9999)], 0, None, Some("2026-09-20"), None),
        Invoice::new(InvoiceId(3), CustomerId(3), "2026-07-15", Status::Paid, vec![line(3, 10, 500), line(6, 2, 799)], 0, None, Some("2026-07-15"), Some("2026-08-10")),
        Invoice::new(InvoiceId(4), CustomerId(1), "2026-09-28", Status::Draft, vec![line(5, 1, 4900)], 0, Some("Renewal"), None, None),
        Invoice::new(InvoiceId(5), CustomerId(4), "2026-06-01", Status::Void, vec![line(9, 1, 22000)], 0, Some("Cancelled by customer"), Some("2026-06-01"), None),
        Invoice::new(InvoiceId(6), CustomerId(5), "2026-07-20", Status::Sent, vec![line(7, 3, 2500)], 0, None, Some("2026-07-20"), None),
        Invoice::new(InvoiceId(7), CustomerId(6), "2026-09-01", Status::Sent, vec![line(10, 20, 150), line(8, 4, 325)], 5, None, Some("2026-09-01"), None),
        Invoice::new(InvoiceId(8), CustomerId(7), "2026-05-01", Status::Sent, vec![line(11, 1, 80000)], 0, Some("On-site"), Some("2026-05-01"), None),
        Invoice::new(InvoiceId(9), CustomerId(8), "2026-09-10", Status::Draft, vec![line(12, 2, 1799)], 0, None, None, None),
        Invoice::new(InvoiceId(10), CustomerId(3), "2026-09-25", Status::Sent, vec![line(1, 1, 1250)], 0, None, Some("2026-09-25"), None),
        Invoice::new(InvoiceId(11), CustomerId(2), "2026-04-01", Status::Paid, vec![line(4, 4, 15000)], 0, None, Some("2026-04-01"), Some("2026-04-10")),
        Invoice::new(InvoiceId(12), CustomerId(4), "2026-08-20", Status::Sent, vec![line(2, 2, 9999), line(6, 1, 799)], 0, None, Some("2026-08-20"), None),
        Invoice::new(InvoiceId(13), CustomerId(5), "2026-03-01", Status::Void, vec![line(1, 5, 1250)], 0, Some("Duplicate"), Some("2026-03-01"), None),
        Invoice::new(InvoiceId(14), CustomerId(1), "2026-09-01", Status::Sent, vec![line(3, 4, 500), line(10, 2, 150)], 0, None, Some("2026-09-01"), None),
        Invoice::new(InvoiceId(15), CustomerId(7), "2026-02-01", Status::Sent, vec![line(8, 10, 325)], 0, None, Some("2026-02-01"), None),
        Invoice::new(InvoiceId(16), CustomerId(8), "2026-09-15", Status::Sent, vec![line(5, 2, 4900)], 0, None, Some("2026-09-15"), None),
        Invoice::new(InvoiceId(17), CustomerId(6), "2026-08-01", Status::Sent, vec![line(6, 1, 799)], 0, None, Some("2026-08-01"), None),
    ]
}

fn payment(invoice_id: i64, amount_cents: i64, received_on: &str, method: &str) -> Payment {
    Payment { invoice_id: InvoiceId(invoice_id), amount_cents: Cents(amount_cents), received_on: received_on.to_string(), method: method.to_string() }
}

pub fn payments() -> Vec<Payment> {
    vec![
        payment(1, 10000, "2026-08-20", "card"),
        payment(3, 7126, "2026-08-10", "transfer"),
        payment(6, 7200, "2026-08-30", "card"),
        payment(8, 50000, "2026-06-15", "transfer"),
        payment(11, 60000, "2026-04-10", "card"),
        payment(12, 461, "2026-09-01", "cash"),
        payment(17, 163, "2026-08-10", "cash"),
    ]
}

pub fn credit_notes() -> Vec<CreditNote> {
    vec![
        CreditNote { id: 1, invoice_id: InvoiceId(7), amount_cents: Cents(429), reason: "damaged stickers".to_string() },
        CreditNote { id: 2, invoice_id: InvoiceId(8), amount_cents: Cents(5000), reason: "late delivery".to_string() },
    ]
}

pub fn find_customer(id: CustomerId) -> Option<Customer> {
    customers().into_iter().find(|c| c.id == id)
}

pub fn find_product(id: ProductId) -> Option<Product> {
    products().into_iter().find(|p| p.id == id)
}

pub fn find_invoice(id: InvoiceId) -> Option<Invoice> {
    invoices().into_iter().find(|i| i.id == id)
}
