// Date helpers that work on "YYYY-MM-DD" text without time zones. They turn a date into a count
// of days (so dates can be added and subtracted) and back again, using whole-number maths, so
// "30 days after 2026-08-20" always means the same day everywhere.

fn digits(s: &str) -> i64 {
    s.parse::<i64>().unwrap_or(0)
}

/// Days since 1970-01-01 for a "YYYY-MM-DD" date.
pub fn to_days(iso: &str) -> i64 {
    let y0 = digits(iso.get(0..4).unwrap_or("0"));
    let m = digits(iso.get(5..7).unwrap_or("0"));
    let d = digits(iso.get(8..10).unwrap_or("0"));
    let y = if m <= 2 { y0 - 1 } else { y0 };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// The "YYYY-MM-DD" date that is `days` days after 1970-01-01.
pub fn from_days(days: i64) -> String {
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{}-{:02}-{:02}", y, m, d)
}

pub fn add_days(iso: &str, days: i64) -> String {
    from_days(to_days(iso) + days)
}

/// How many days `b` is after `a` (negative if before).
pub fn days_between(a: &str, b: &str) -> i64 {
    to_days(b) - to_days(a)
}

pub fn is_after(a: &str, b: &str) -> bool {
    to_days(a) > to_days(b)
}
