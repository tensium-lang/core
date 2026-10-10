// This file is the "auto-repair" step. It looks at the mistakes the checker found, and for each one
// that comes with an exact "replace this with that" suggestion, it makes the change itself. Then it
// checks again, and repeats until the program is fixed or no more suggestions are left. It never
// guesses: it only does what the compiler's own suggestions say, so it shows how good those
// suggestions really are.

import { Diagnostic } from './diagnostics.ts';
import { compile } from './index.ts';

export interface FixResult {
  source: string;
  ok: boolean;
  /** How many check-and-repair rounds ran. */
  rounds: number;
  /** How many individual edits were applied. */
  applied: number;
  /** Mistakes still left (empty when ok). */
  remaining: Diagnostic[];
}

const offsetOf = (src: string, line: number, col: number): number =>
  src.split('\n').slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0) + col - 1;

export function applyFixes(source: string, file = 'input.tn', maxRounds = 10): FixResult {
  let cur = source;
  let rounds = 0;
  let applied = 0;
  const seen = new Set<string>([cur]);
  for (;;) {
    const r = compile(cur, file);
    if (r.ok || rounds >= maxRounds) return { source: cur, ok: r.ok, rounds, applied, remaining: r.diagnostics };
    const edits = r.diagnostics
      .filter((d) => d.suggestedFix?.edit)
      .map((d) => {
        const e = d.suggestedFix!.edit!;
        return { start: offsetOf(cur, e.span.startLine, e.span.startCol), end: offsetOf(cur, e.span.endLine, e.span.endCol), text: e.newText };
      });
    // Prefer the smallest edits; skip any edit that overlaps one already chosen (a later round can pick it up).
    const chosen: typeof edits = [];
    for (const e of [...edits].sort((a, b) => a.end - a.start - (b.end - b.start))) {
      if (!chosen.some((c) => e.start < c.end && c.start < e.end || (e.start === c.start && e.end === c.end))) chosen.push(e);
    }
    if (chosen.length === 0) return { source: cur, ok: false, rounds, applied, remaining: r.diagnostics };
    let next = cur;
    for (const e of chosen.sort((a, b) => b.start - a.start)) next = next.slice(0, e.start) + e.text + next.slice(e.end);
    rounds++;
    applied += chosen.length;
    if (seen.has(next)) return { source: next, ok: false, rounds, applied, remaining: compile(next, file).diagnostics };
    seen.add(next);
    cur = next;
  }
}
