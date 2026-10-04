// This file enforces one of Tensium's house rules: every file must start with a note
// that says, in plain words, what the file is for. Think of it like a name tag.
// It looks at the very top of a .tn file, complains if the note is missing or
// unfinished, and can hand the note's words to the compiler so they get copied
// into the TypeScript file it writes.

import { Diagnostic, Loc, mkDiag } from './diagnostics.ts';

export interface Header { lines: string[]; loc: Loc }

const MIN_WORDS = 5;

function locAt(src: string, file: string, so: number, eo: number): Loc {
  const pos = (off: number) => {
    const before = src.slice(0, off).split('\n');
    return { line: before.length, col: before[before.length - 1].length + 1 };
  };
  const s = pos(so), e = pos(eo);
  return { file, startLine: s.line, startCol: s.col, endLine: e.line, endCol: e.col, so, eo };
}

/** Reads the comment at the very top of the file (// lines or one block comment), if there is one. */
export function readHeader(src: string, file: string): Header | null {
  let i = 0;
  while (i < src.length && /\s/.test(src[i])) i++;
  const start = i;
  const lines: string[] = [];
  if (src.startsWith('//', i)) {
    let pos = i;
    let end = i;
    while (pos < src.length) {
      const eol = src.indexOf('\n', pos);
      const stop = eol < 0 ? src.length : eol;
      const line = src.slice(pos, stop).trimStart();
      if (!line.startsWith('//')) break;
      lines.push(line.slice(2).trim());
      end = stop;
      if (eol < 0) break;
      pos = eol + 1;
    }
    return { lines, loc: locAt(src, file, start, end) };
  }
  if (src.startsWith('/*', i)) {
    const close = src.indexOf('*/', i + 2);
    if (close < 0) return null;
    const body = src.slice(i + 2, close);
    for (const l of body.split('\n')) lines.push(l.replace(/^\s*\*?\s?/, '').trim());
    return { lines: lines.filter((l, k) => l !== '' || (k > 0 && k < lines.length - 1)), loc: locAt(src, file, start, close + 2) };
  }
  return null;
}

export function checkHeader(src: string, file: string): Diagnostic[] {
  const h = readHeader(src, file);
  const top = locAt(src, file, 0, 0);
  if (!h) {
    const first = src.trim().split('\n')[0]?.trim();
    return [mkDiag('TN4001', 'File must start with a comment that explains, in plain words, what the file does.', top, {
      expected: 'a comment at the very top of the file (// ...) written so a 5th grader can understand it',
      actual: first ? `'${first.slice(0, 40)}'` : 'empty file',
      fix: {
        description: 'Add a comment at the top that says what this file does, in simple words. Replace the TODO.',
        edit: { loc: top, newText: '// TODO: say in simple words what this file does, so a 5th grader could understand it.\n\n' },
      },
    })];
  }
  const text = h.lines.join(' ');
  const words = text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
  if (/\bTODO\b/i.test(text) || words.length < MIN_WORDS) {
    return [mkDiag('TN4002', 'The comment at the top of the file is unfinished or too short to explain what the file does.', h.loc, {
      expected: `a finished explanation of at least ${MIN_WORDS} words, with no TODO, in plain words`,
      actual: `${words.length} word${words.length === 1 ? '' : 's'}${/\bTODO\b/i.test(text) ? ', contains TODO' : ''}`,
      fix: { description: 'Rewrite the top comment so it clearly says what this file does, in simple words.' },
    })];
  }
  return [];
}
