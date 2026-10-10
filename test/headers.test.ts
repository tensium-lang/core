// This file checks the "every file starts with a plain-words note" rule for the whole project.
// It looks at each file we wrote (code, docs, tasks, examples) and fails if the note at the
// top is missing, too short, or left unfinished. So a new file can't sneak in without one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'runs', '.git']);
// JSON cannot hold comments; lock files are written by npm and cargo, not by us; .patch files are written by diff.
const SKIP_FILES = new Set(['package.json', 'package-lock.json', 'Cargo.lock']);
const SKIP_EXT = ['.patch'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (!SKIP_FILES.has(name) && !SKIP_EXT.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

function headerText(path: string, src: string): string | null {
  const body = src.startsWith('#!') ? src.slice(src.indexOf('\n') + 1) : src;
  if (path.endsWith('.md')) return /^<!--([\s\S]*?)-->/.exec(body)?.[1] ?? null;
  const prefix = path.endsWith('.gitignore') || path.endsWith('.toml') ? '#' : '//';
  const lines: string[] = [];
  for (const l of body.split('\n')) {
    if (!l.startsWith(prefix)) break;
    lines.push(l.slice(prefix.length).trim());
  }
  return lines.length ? lines.join(' ') : null;
}

test('every file in the project starts with a plain-words note', () => {
  const files = walk('.');
  assert.ok(files.length > 20, 'expected to find the project files');
  const bad: string[] = [];
  for (const f of files) {
    const text = headerText(f, readFileSync(f, 'utf8'));
    const words = (text ?? '').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
    if (words.length < 5 || /\bTODO\b/.test(text ?? '')) bad.push(f);
  }
  assert.deepEqual(bad, [], 'these files need a plain-words comment at the top');
});
