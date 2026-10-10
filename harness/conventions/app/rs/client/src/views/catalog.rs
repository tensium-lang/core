// The catalog and directory screens: the list of products with prices, a product search, the
// customers in a region, and the aging report.

use serde_json::json;
use shared::{AgingBuckets, Customer, Product};

use crate::format::format_cents;
use crate::rpc::rpc;

pub fn catalog_view() -> String {
    match rpc::<Vec<Product>>("listProducts", &[]) {
        Ok(ps) => ps
            .iter()
            .map(|p| format!("{} - {}{}", p.name, format_cents(p.unit_cents), if p.taxable { " (taxable)" } else { "" }))
            .collect::<Vec<_>>()
            .join("\n"),
        Err(e) => format!("error: {}", e),
    }
}

pub fn search_view(text: &str) -> String {
    match rpc::<Vec<Product>>("searchProducts", &[json!(text)]) {
        Ok(ps) if ps.is_empty() => "No products match".to_string(),
        Ok(ps) => ps.iter().map(|p| format!("{} - {}", p.name, format_cents(p.unit_cents))).collect::<Vec<_>>().join("\n"),
        Err(e) => format!("error: {}", e),
    }
}

pub fn region_view(region: &str) -> String {
    match rpc::<Vec<Customer>>("customersInRegion", &[json!(region)]) {
        Ok(cs) => cs.iter().map(|c| format!("{} (net {})", c.name, c.terms_days)).collect::<Vec<_>>().join("\n"),
        Err(e) => format!("error: {}", e),
    }
}

pub fn aging_view() -> String {
    match rpc::<AgingBuckets>("agingReport", &[]) {
        Ok(b) => format!(
            "Current: {}\n1-30 days: {}\n31-60 days: {}\n61-90 days: {}\nOver 90 days: {}",
            format_cents(b.current),
            format_cents(b.days1to30),
            format_cents(b.days31to60),
            format_cents(b.days61to90),
            format_cents(b.over90)
        ),
        Err(e) => format!("error: {}", e),
    }
}
