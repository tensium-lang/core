// This file chops the text of a program into small pieces called tokens, like cutting
// a sentence into words and punctuation. It remembers the line and column of each piece so
// mistakes can be pointed out exactly, and it skips comments.

import { Diagnostic, Loc, mkDiag } from './diagnostics.ts';

export type TokKind = 'ident' | 'num' | 'str' | 'punct' | 'eof';

export interface Token {
  kind: TokKind;
  text: string; // raw source text
  value?: string | number; // decoded literal value
  loc: Loc;
}

const PUNCT = [
  '===', '!==', '...', '=>', '==', '!=', '<=', '>=', '&&', '||',
  '+', '-', '*', '/', '%', '<', '>', '=', '!', '(', ')', '{', '}', '[', ']', ':', ';', ',', '|', '.',
];

export function lex(src: string, file: string): { tokens: Token[]; diagnostics: Diagnostic[] } {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const mk = (so: number, sl: number, sc: number): Loc => ({
    file, startLine: sl, startCol: sc, endLine: line, endCol: col, so, eo: i,
  });
  const adv = () => {
    if (src[i] === '\n') { line++; col = 1; } else col++;
    i++;
  };

  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { adv(); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') adv(); continue; }
    if (c === '/' && src[i + 1] === '*') {
      adv(); adv();
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) adv();
      if (i < src.length) { adv(); adv(); }
      continue;
    }
    const so = i, sl = line, sc = col;
    if (/[A-Za-z_$]/.test(c)) {
      while (i < src.length && /[A-Za-z0-9_$]/.test(src[i])) adv();
      tokens.push({ kind: 'ident', text: src.slice(so, i), loc: mk(so, sl, sc) });
    } else if (/[0-9]/.test(c)) {
      while (i < src.length && /[0-9]/.test(src[i])) adv();
      if (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? '')) {
        adv();
        while (i < src.length && /[0-9]/.test(src[i])) adv();
      }
      const text = src.slice(so, i);
      tokens.push({ kind: 'num', text, value: Number(text), loc: mk(so, sl, sc) });
    } else if (c === '"' || c === "'") {
      const q = c;
      adv();
      let val = '';
      let closed = false;
      while (i < src.length && src[i] !== '\n') {
        if (src[i] === q) { adv(); closed = true; break; }
        if (src[i] === '\\') {
          adv();
          const e = src[i];
          val += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          adv();
        } else { val += src[i]; adv(); }
      }
      const loc = mk(so, sl, sc);
      if (!closed) diagnostics.push(mkDiag('TN0001', 'Unterminated string literal.', loc, { expected: `closing ${q}`, actual: 'end of line' }));
      tokens.push({ kind: 'str', text: src.slice(so, i), value: val, loc });
    } else {
      const p = PUNCT.find((x) => src.startsWith(x, i));
      if (p) {
        for (let k = 0; k < p.length; k++) adv();
        tokens.push({ kind: 'punct', text: p, loc: mk(so, sl, sc) });
      } else {
        adv();
        diagnostics.push(mkDiag('TN0001', `Unexpected character '${c}'.`, mk(so, sl, sc), { actual: `'${c}'` }));
      }
    }
  }
  tokens.push({ kind: 'eof', text: '<end of file>', loc: { file, startLine: line, startCol: col, endLine: line, endCol: col, so: i, eo: i } });
  return { tokens, diagnostics };
}
