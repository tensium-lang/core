// How the client talks to the server: connect(url) says where the server is, and rpc(name, args)
// sends one request ("POST /rpc/<name>" with the arguments as a JSON array) and gives back the
// server's Result. If the network fails, that failure comes back as an Err too.

use std::sync::OnceLock;

use serde::de::DeserializeOwned;
use serde_json::Value;

static ENDPOINT: OnceLock<String> = OnceLock::new();

/// Tells the client where the server is.
pub fn connect(url: &str) {
    let _ = ENDPOINT.set(url.trim_end_matches('/').to_string());
}

pub fn rpc<T: DeserializeOwned>(name: &str, args: &[Value]) -> Result<T, String> {
    let base = ENDPOINT.get().map(String::as_str).unwrap_or("http://127.0.0.1:8787");
    let res = ureq::post(&format!("{}/rpc/{}", base, name))
        .set("content-type", "application/json")
        .send_string(&Value::Array(args.to_vec()).to_string());
    let body: Value = match res {
        Ok(r) => r.into_json().map_err(|e| format!("network: {}", e))?,
        Err(ureq::Error::Status(code, _)) => return Err(format!("network: HTTP {}", code)),
        Err(e) => return Err(format!("network: {}", e)),
    };
    if body.get("ok") == Some(&Value::Bool(true)) {
        serde_json::from_value(body.get("value").cloned().unwrap_or(Value::Null)).map_err(|e| format!("network: {}", e))
    } else {
        Err(body.get("error").and_then(Value::as_str).unwrap_or("network: unexpected response").to_string())
    }
}
