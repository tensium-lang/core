<!-- This is the task description a helper reads: turning text into a number and keeping it between a low and a high limit. (The experiment tool removes this note before showing it.) -->

Write `fn parseClamped(s: string, lo: number, hi: number): Result<number, string>`.

Parse `s` as an integer and clamp it into the range `lo..hi` (inclusive): values below `lo` become `lo`, values above `hi` become `hi`. Return `err(...)` (any message) when `s` is not an integer. Assume `lo <= hi`.
