// This file is the front door of the compiler. You hand it the text of a .tn file and it
// runs every step in order (read, check, write) and gives back the list of mistakes,
// whether the program is OK, and the TypeScript if it is.

import { check } from './checker.ts';
import { Diagnostic } from './diagnostics.ts';
import { emit } from './emit.ts';
import { checkHeader, readHeader } from './header.ts';
import { parse } from './parser.ts';

export * from './diagnostics.ts';

export interface CompileResult {
  diagnostics: Diagnostic[];
  ok: boolean;
  /** TypeScript output; only present when there are no errors. */
  ts?: string;
}

const order = (a: Diagnostic, b: Diagnostic) =>
  a.span.startLine - b.span.startLine || a.span.startCol - b.span.startCol;

export function compile(source: string, file = 'input.tn'): CompileResult {
  const { program, diagnostics: syntax } = parse(source, file);
  // Semantic checking runs even after syntax errors (the parser recovers), so agents see everything at once.
  const semantic = check(program, file, source);
  const diagnostics = [...checkHeader(source, file), ...syntax, ...semantic].sort(order);
  const ok = !diagnostics.some((d) => d.severity === 'error');
  return { diagnostics, ok, ts: ok ? emit(program, readHeader(source, file)?.lines ?? []) : undefined };
}
