// Money arithmetic. Every amount is a whole number of cents, and every percentage goes through
// percent_of, which uses whole-number maths and rounds halves to the nearest even cent (so 4.5
// cents becomes 4 and 5.5 becomes 6). That way every part of the app rounds the same way.

use crate::types::Cents;

/// `basis_points` of `amount`: 100 basis points = 1 %, so percent_of(amount, 150) is 1.5 % of it.
/// Rounds half to even using integer arithmetic only.
pub fn percent_of(amount: Cents, basis_points: i64) -> Cents {
    let numerator = amount.0 * basis_points;
    let negative = numerator < 0;
    let n = numerator.abs();
    let whole = n / 10000;
    let remainder = n - whole * 10000;
    let twice = remainder * 2;
    let rounded = if twice > 10000 || (twice == 10000 && whole % 2 == 1) { whole + 1 } else { whole };
    Cents(if negative { -rounded } else { rounded })
}

pub fn sum_cents(amounts: &[Cents]) -> Cents {
    Cents(amounts.iter().map(|c| c.0).sum())
}

pub fn add(a: Cents, b: Cents) -> Cents {
    Cents(a.0 + b.0)
}

pub fn sub(a: Cents, b: Cents) -> Cents {
    Cents(a.0 - b.0)
}

pub fn times(unit: Cents, quantity: i64) -> Cents {
    Cents(unit.0 * quantity)
}

/// "$12.50" style text.
pub fn format_cents(cents: Cents) -> String {
    let sign = if cents.0 < 0 { "-" } else { "" };
    let abs = cents.0.abs();
    format!("{}${}.{:02}", sign, abs / 100, abs % 100)
}
