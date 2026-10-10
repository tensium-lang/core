// The product catalog and the customer directory on the server: every product, products whose
// name contains some text, and the customers in a region.

use shared::{Customer, Product};

use crate::data::{customers, products};

pub fn list_products() -> Result<Vec<Product>, String> {
    Ok(products())
}

/// Products whose name contains the text, ignoring case. An empty search is an error.
pub fn search_products(text: &str) -> Result<Vec<Product>, String> {
    let needle = text.trim().to_lowercase();
    if needle.is_empty() {
        return Err("search text is empty".to_string());
    }
    Ok(products().into_iter().filter(|p| p.name.to_lowercase().contains(&needle)).collect())
}

pub fn customers_in_region(region: &str) -> Result<Vec<Customer>, String> {
    let found: Vec<Customer> = customers().into_iter().filter(|c| c.region == region).collect();
    if found.is_empty() {
        return Err(format!("no customers in region {}", region));
    }
    Ok(found)
}
