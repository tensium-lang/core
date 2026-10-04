#!/usr/bin/env -S npx tsx
// This file is the "tn" command you type in a terminal. "tn check file.tn" looks for
// mistakes and tells you about them (as pretty text, short text, or JSON for a computer).
// "tn build file.tn" turns a good program into a TypeScript file.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { compile, toJSON, toPretty, toProse } from './index.ts';

const USAGE = `usage:
  tn check <file.tn> [--format json|pretty|prose]   (default: pretty; exit 1 on errors)
  tn build <file.tn> [-o out.ts]                    (writes TypeScript; prints diagnostics and exits 1 on errors)`;

const [cmd, file, ...rest] = process.argv.slice(2);
if (!cmd || !file || !['check', 'build'].includes(cmd)) { console.error(USAGE); process.exit(2); }

const flag = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
const source = readFileSync(file, 'utf8');
const result = compile(source, basename(file));
const format = flag('--format') ?? (cmd === 'build' ? 'pretty' : 'pretty');

if (!result.ok || cmd === 'check') {
  const out = format === 'json' ? toJSON(result.diagnostics)
    : format === 'prose' ? toProse(result.diagnostics)
    : toPretty(result.diagnostics, source);
  if (format !== 'prose' || result.diagnostics.length > 0) console.log(out);
}
if (cmd === 'build' && result.ok) {
  const outFile = flag('-o') ?? file.replace(/\.tn$/, '') + '.ts';
  writeFileSync(outFile, result.ts!);
  console.error(`wrote ${outFile}`);
}
process.exit(result.ok ? 0 : 1);
