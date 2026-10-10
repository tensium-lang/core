// This file defines what a mistake report looks like: a code, a message, exactly where
// it is in the file, what was expected, what was found, and a suggested fix. It also
// knows how to print the reports three ways: JSON for computers, short one-line text,
// and a friendly picture with little arrows pointing at the problem.

// Structured diagnostics: the JSON shape is the product; the pretty-printer is a convenience.

export interface Span {
  file: string;
  startLine: number; // 1-based
  startCol: number; // 1-based
  endLine: number;
  endCol: number; // exclusive: the column just past the last character
}

/** Internal span that also carries absolute offsets (stripped before emitting JSON). */
export interface Loc extends Span {
  so: number;
  eo: number;
}

export interface SuggestedFix {
  description: string;
  /** Present only when the fix is mechanical: replace `span` with `newText` (zero-width span = insert). */
  edit?: { span: Span; newText: string };
}

export interface Diagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  span: Span;
  expected: string | null;
  actual: string | null;
  suggestedFix: SuggestedFix | null;
}

export const pub = (l: Loc | Span): Span => ({
  file: l.file,
  startLine: l.startLine,
  startCol: l.startCol,
  endLine: l.endLine,
  endCol: l.endCol,
});

export const join = (a: Loc, b: Loc): Loc => ({
  file: a.file,
  startLine: a.startLine,
  startCol: a.startCol,
  endLine: b.endLine,
  endCol: b.endCol,
  so: a.so,
  eo: b.eo,
});

export interface FixSpec {
  description: string;
  edit?: { loc: Loc; newText: string };
}

export function mkDiag(
  code: string,
  message: string,
  loc: Loc,
  o: { expected?: string; actual?: string; fix?: FixSpec; severity?: 'error' | 'warning' } = {},
): Diagnostic {
  return {
    code,
    severity: o.severity ?? 'error',
    message,
    span: pub(loc),
    expected: o.expected ?? null,
    actual: o.actual ?? null,
    suggestedFix: o.fix
      ? {
          description: o.fix.description,
          ...(o.fix.edit ? { edit: { span: pub(o.fix.edit.loc), newText: o.fix.edit.newText } } : {}),
        }
      : null,
  };
}

/** Machine-readable output: a JSON array of diagnostics. */
export const toJSON = (ds: Diagnostic[]): string => JSON.stringify(ds, null, 2);

/** Compiler-style single-line prose, deliberately without expected/actual/fix structure. */
export function toProse(ds: Diagnostic[]): string {
  return ds
    .map((d) => `${d.span.file}(${d.span.startLine},${d.span.startCol}): ${d.severity} ${d.code}: ${d.message}`)
    .join('\n');
}

/** Human-readable rendering with source excerpts. */
export function toPretty(ds: Diagnostic[], source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  for (const d of ds) {
    const s = d.span;
    out.push(`${d.severity}[${d.code}]: ${d.message}`);
    out.push(`  --> ${s.file}:${s.startLine}:${s.startCol}`);
    const gutter = String(s.startLine).length;
    const pad = ' '.repeat(gutter);
    const text = lines[s.startLine - 1] ?? '';
    const endCol = s.endLine === s.startLine ? s.endCol : text.length + 1;
    const width = Math.max(1, endCol - s.startCol);
    out.push(`${pad} |`);
    out.push(`${s.startLine} | ${text}`);
    out.push(`${pad} | ${' '.repeat(s.startCol - 1)}${'^'.repeat(width)}`);
    if (d.expected !== null) out.push(`${pad} = expected: ${d.expected}`);
    if (d.actual !== null) out.push(`${pad} = actual:   ${d.actual}`);
    if (d.suggestedFix) {
      out.push(`${pad} = fix: ${d.suggestedFix.description}`);
      if (d.suggestedFix.edit) {
        const e = d.suggestedFix.edit;
        const verb = e.span.startLine === e.span.endLine && e.span.startCol === e.span.endCol ? 'insert' : 'replace with';
        out.push(`${pad}   (${verb}: ${JSON.stringify(e.newText)})`);
      }
    }
    out.push('');
  }
  const errs = ds.filter((d) => d.severity === 'error').length;
  out.push(errs === 0 ? 'no errors' : `${errs} error${errs === 1 ? '' : 's'}`);
  return out.join('\n');
}
