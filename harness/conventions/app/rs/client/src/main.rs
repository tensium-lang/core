// The invoicing client. It is run as `client <server url> <screen> <json array of arguments>`,
// asks the server for what the screen needs, and prints the screen's text as a JSON string.

#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod format;
mod rpc;
mod views;

use serde_json::Value;

fn num(args: &[Value], i: usize) -> Result<i64, String> {
    args.get(i).and_then(Value::as_i64).ok_or_else(|| format!("argument {} must be a number", i))
}

fn text(args: &[Value], i: usize) -> Result<String, String> {
    args.get(i).and_then(Value::as_str).map(str::to_string).ok_or_else(|| format!("argument {} must be a string", i))
}

/// Every screen the client can show, by name.
fn screen(name: &str, a: &[Value]) -> Result<String, String> {
    match name {
        "invoiceView" => Ok(views::invoice::invoice_view(num(a, 0)?)),
        "productLabel" => Ok(views::invoice::product_label(num(a, 0)?)),
        "receiptLine" => Ok(views::invoice::receipt_line(num(a, 0)?)),
        "reminderPreview" => Ok(views::invoice::reminder_preview(num(a, 0)?)),
        "customerView" => Ok(views::customer::customer_view(num(a, 0)?)),
        "contactLine" => Ok(views::customer::contact_line(num(a, 0)?)),
        "dashboardView" => Ok(views::dashboard::dashboard_view()),
        "overdueView" => Ok(views::dashboard::overdue_view()),
        "catalogView" => Ok(views::catalog::catalog_view()),
        "searchView" => Ok(views::catalog::search_view(&text(a, 0)?)),
        "regionView" => Ok(views::catalog::region_view(&text(a, 0)?)),
        "agingView" => Ok(views::catalog::aging_view()),
        _ => Err(format!("no such screen: {}", name)),
    }
}

fn main() -> Result<(), String> {
    let argv: Vec<String> = std::env::args().collect();
    let (url, name, raw) = match (argv.get(1), argv.get(2), argv.get(3)) {
        (Some(u), Some(n), Some(r)) => (u, n, r),
        _ => return Err("usage: client <url> <screen> <json args>".to_string()),
    };
    rpc::connect(url);
    let args: Vec<Value> = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let text = screen(name, &args)?;
    println!("{}", Value::String(text));
    Ok(())
}
