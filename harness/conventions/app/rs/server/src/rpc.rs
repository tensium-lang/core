// The server's front door. It lists every function the client may call, and runs the HTTP
// server that answers "POST /rpc/<name>" with a JSON array of arguments by calling that function
// and sending its result back as JSON: {"ok":true,"value":...} or {"ok":false,"error":"..."}.

use serde::Serialize;
use serde_json::{json, Value};
use shared::{CustomerId, InvoiceId, ProductId};
use tiny_http::{Header, Method, Response, Server};

use crate::aging::aging_report;
use crate::catalog::{customers_in_region, list_products, search_products};
use crate::credits::credits_for;
use crate::customers::{customer_invoices, get_customer, get_product};
use crate::invoices::{get_invoice, invoice_totals};
use crate::payments::payments_for;
use crate::reminders::reminder_text;
use crate::reports::{dashboard_stats, overdue_invoices};
use crate::webhooks::signed_receipt;

/// Every route takes the JSON arguments and gives back a Result: the client reads `ok` on everything.
type Handler = fn(&[Value]) -> Result<Value, String>;

fn num(args: &[Value], i: usize) -> Result<i64, String> {
    args.get(i).and_then(Value::as_i64).ok_or_else(|| format!("argument {} must be a number", i))
}

fn text(args: &[Value], i: usize) -> Result<String, String> {
    args.get(i).and_then(Value::as_str).map(str::to_string).ok_or_else(|| format!("argument {} must be a string", i))
}

/// Turns a function's Result into the JSON the client expects.
fn out<T: Serialize>(r: Result<T, String>) -> Result<Value, String> {
    let v = r?;
    serde_json::to_value(v).map_err(|e| e.to_string())
}

const ROUTES: &[(&str, Handler)] = &[
    ("getCustomer", |a| out(get_customer(CustomerId(num(a, 0)?)))),
    ("getProduct", |a| out(get_product(ProductId(num(a, 0)?)))),
    ("getInvoice", |a| out(get_invoice(InvoiceId(num(a, 0)?)))),
    ("invoiceTotals", |a| out(invoice_totals(InvoiceId(num(a, 0)?)))),
    ("customerInvoices", |a| out(customer_invoices(CustomerId(num(a, 0)?)))),
    ("paymentsFor", |a| out(payments_for(InvoiceId(num(a, 0)?)))),
    ("creditsFor", |a| out(credits_for(InvoiceId(num(a, 0)?)))),
    ("reminderText", |a| out(reminder_text(InvoiceId(num(a, 0)?)))),
    ("dashboardStats", |_| out(dashboard_stats())),
    ("overdueInvoices", |_| out(overdue_invoices())),
    ("signedReceipt", |a| out(signed_receipt(InvoiceId(num(a, 0)?)))),
    ("listProducts", |_| out(list_products())),
    ("searchProducts", |a| out(search_products(&text(a, 0)?))),
    ("customersInRegion", |a| out(customers_in_region(&text(a, 0)?))),
    ("agingReport", |_| out(aging_report())),
];

fn wire(r: Result<Value, String>) -> Value {
    match r {
        Ok(value) => json!({ "ok": true, "value": value }),
        Err(error) => json!({ "ok": false, "error": error }),
    }
}

/// Runs the server until it is stopped. Prints "LISTENING <url>" once it is ready.
pub fn serve(port: &str) -> Result<(), String> {
    let server = Server::http(format!("127.0.0.1:{}", port)).map_err(|e| e.to_string())?;
    let addr = server.server_addr().to_ip().ok_or_else(|| "no address".to_string())?;
    println!("LISTENING http://{}", addr);
    for mut req in server.incoming_requests() {
        let name = req.url().strip_prefix("/rpc/").map(str::to_string);
        let handler = name.as_deref().and_then(|n| ROUTES.iter().find(|(k, _)| *k == n)).map(|(_, h)| *h);
        let (status, body) = match (req.method(), handler) {
            (&Method::Post, Some(h)) => {
                let mut raw = String::new();
                let _ = req.as_reader().read_to_string(&mut raw);
                match serde_json::from_str::<Vec<Value>>(&raw) {
                    Ok(args) => (200, wire(h(&args)).to_string()),
                    Err(_) => (400, String::new()),
                }
            }
            _ => (404, String::new()),
        };
        let header = Header::from_bytes("Content-Type", "application/json").map_err(|_| "bad header".to_string())?;
        let _ = req.respond(Response::from_string(body).with_status_code(status).with_header(header));
    }
    Ok(())
}
