// Small text helpers for the client's screens: money as "$12.50", a status as a word, and a
// discount as "(10% off)".

use shared::{Cents, Status};

pub fn format_cents(cents: Cents) -> String {
    shared::money::format_cents(cents)
}

pub fn status_word(s: Status) -> &'static str {
    match s {
        Status::Draft => "draft",
        Status::Sent => "sent",
        Status::Paid => "paid",
        Status::Void => "void",
    }
}

pub fn discount_note(percent: i64) -> String {
    if percent == 0 {
        String::new()
    } else {
        format!(" ({}% off)", percent)
    }
}
