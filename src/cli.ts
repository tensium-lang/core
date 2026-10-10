#!/usr/bin/env -S npx tsx
// This file is the "tn" command you type in a terminal. "tn check file.tn" looks for
// mistakes and tells you about them (as pretty text, short text, or JSON for a computer).
// "tn build file.tn" turns a good program into TypeScript (two files, one for the server and
// one for the client, when the program has both sides). "tn fix file.tn" repairs what it can.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { applyFixes } from './fix.ts';
import { compile, toJSON, toPretty, toProse } from './index.ts';

const USAGE = `usage:
  tn check <file.tn> [--format json|pretty|prose]   (default: pretty; exit 1 on errors)
  tn build <file.tn> [-o out.ts]                    (writes TypeScript; prints diagnostics and exits 1 on errors;
                                                     a program with server/client parts writes out.server.ts + out.client.ts)
  tn fix <file.tn> [--write]                        (applies the checker's own suggested edits until clean or stuck;
                                                     prints the repaired file, or rewrites it with --write)`;

const [cmd, file, ...rest] = process.argv.slice(2);
if (!cmd || !file || !['check', 'build', 'fix'].includes(cmd)) { console.error(USAGE); process.exit(2); }

const flag = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
const source = readFileSync(file, 'utf8');
if (cmd === 'fix') {
  const fixed = applyFixes(source, basename(file));
  if (rest.includes('--write')) writeFileSync(file, fixed.source); else process.stdout.write(fixed.source);
  console.error(fixed.ok ? `fixed in ${fixed.rounds} round(s), ${fixed.applied} edit(s)` : `stuck after ${fixed.rounds} round(s); ${fixed.remaining.length} problem(s) need a person or an agent`);
  process.exit(fixed.ok ? 0 : 1);
}
const result = compile(source, basename(file));
const format = flag('--format') ?? (cmd === 'build' ? 'pretty' : 'pretty');

if (!result.ok || cmd === 'check') {
  const out = format === 'json' ? toJSON(result.diagnostics)
    : format === 'prose' ? toProse(result.diagnostics)
    : toPretty(result.diagnostics, source);
  if (format !== 'prose' || result.diagnostics.length > 0) console.log(out);
}
if (cmd === 'build' && result.ok) {
  const base = (flag('-o') ?? file).replace(/\.(tn|ts)$/, '');
  const outputs: [string, string | undefined][] = result.sided
    ? [[`${base}.server.ts`, result.server], [`${base}.client.ts`, result.client]]
    : [[`${base}.ts`, result.ts]];
  for (const [path, text] of outputs) { writeFileSync(path, text!); console.error(`wrote ${path}`); }
}
process.exit(result.ok ? 0 : 1);
