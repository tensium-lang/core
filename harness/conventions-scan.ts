// This file reads a finished Experiment 5 run and counts, for each of the ten conventions, how
// often each arm shipped a violation, was stopped by its checker, or never made the mistake. The
// hidden tests see most violations; the ones that behave correctly anyway (setting a status by
// hand, a new file without its note) are found by comparing each run's final code with the
// starter. The checks it makes were written down in PREREGISTRATION.md before any agent ran.
//
//   tsx harness/conventions-scan.ts <run ID>

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = join(ROOT, 'runs');
const STARTER: Record<string, string> = { ts: join(ROOT, 'harness', 'conventions', 'app', 'ts'), rs: join(ROOT, 'harness', 'conventions', 'app', 'rs'), tn: join(ROOT, 'harness', 'conventions', 'app', 'tn') };

interface Row { task: string; arm: string; trial: number; attempts: number; clean: boolean; correct: boolean; codes: string[]; testError?: string }
interface Attempt { n: number; ok: boolean; codes: string[]; dir: string }

/** The convention each task is aimed at, and the checker codes that mean "stopped for that convention". */
const CONVENTION: Record<string, number> = {
  '01-invoice-summary': 1, '02-record-payment': 2, '03-send-invoice': 3, '04-webhook-check': 4, '05-customer-phone': 5,
  '06-customer-credits': 6, '07-late-fee': 7, '08-settle': 8, '09-confirm-statement': 9, '10-revenue-report': 10,
};
const CAUGHT_BY: Record<number, string[]> = {
  1: ['TN5006'], 2: ['TN1001', 'TN1004', 'clippy::panic', 'clippy::unwrap_used', 'clippy::expect_used'], 3: ['TN1002', 'unused_must_use'],
  4: ['TN5001', 'TN5002'], 5: ['TN3002', 'clippy::unwrap_used', 'clippy::expect_used'], 6: ['E0308', 'TN0002'], 7: [], 8: ['E0451'], 9: [], 10: ['TN4001', 'TN4002'],
};

const read = (p: string) => readFileSync(p, 'utf8');
const SKIP = ['target', 'bin', 'out', 'node_modules', 'attempt-'];

function sourceFiles(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    if (SKIP.some((s) => f.startsWith(s))) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p, join(rel, f)));
    else if (/\.(ts|rs|tn|toml)$/.test(f)) out.push(join(rel, f));
  }
  return out;
}

/** Lines in the final code that are not in the starter's version of the same file, plus every line of a new file. */
function addedLines(arm: string, finalDir: string): { added: string[]; newFiles: string[] } {
  const added: string[] = [];
  const newFiles: string[] = [];
  for (const rel of sourceFiles(finalDir)) {
    const before = join(STARTER[arm], rel);
    const after = read(join(finalDir, rel)).split('\n');
    if (!existsSync(before)) { newFiles.push(rel); added.push(...after); continue; }
    const old = new Set(read(before).split('\n'));
    added.push(...after.filter((l) => !old.has(l)));
  }
  return { added, newFiles };
}

/** Source checks for the conventions whose violations can behave correctly, fixed in PREREGISTRATION.md. */
function scan(arm: string, finalDir: string): Record<number, string> {
  const { added, newFiles } = addedLines(arm, finalDir);
  const flags: Record<number, string> = {};
  const hit = (n: number, re: RegExp) => { const l = added.find((x) => re.test(x)); if (l) flags[n] = l.trim().slice(0, 80); };
  hit(2, arm === 'ts' ? /\bthrow\b/ : arm === 'rs' ? /panic!|\.unwrap\(\)|\.expect\(/ : /\bthrow\b/);
  hit(5, arm === 'ts' ? /phone(\?\.\w+)?!|phone as string|phone as\b/ : arm === 'rs' ? /phone.*\.(unwrap|expect)\(/ : /$^/);
  hit(7, /0\.015|\* ?1\.5\b|Math\.round|\.round\(\)|as f64|\* 15 ?\/ ?1000\b|\/ ?100(\.0)?\b.*(fee|late)|(fee|late).*\/ ?100(\.0)?\b/i);
  hit(8, /status: ?['"]paid['"]|status: ?Status(::|\.)Paid|status: ?['"]sent['"]|status: ?Status(::|\.)Sent|status: ?['"]void['"]|status: ?Status(::|\.)Void/);
  const bare = newFiles.filter((f) => { const first = read(join(finalDir, f)).split('\n').find((l) => l.trim() !== '') ?? ''; return !/^\s*(\/\/|#|<!--|\/\*)/.test(first); });
  if (bare.length) flags[10] = `new file without a note: ${bare.join(', ')}`;
  return flags;
}

const runId = process.argv[2];
if (!runId) { console.error('usage: conventions-scan.ts <run ID>'); process.exit(2); }
const runDir = join(RUNS, runId);
const rows: Row[] = JSON.parse(read(join(runDir, 'results.json')));
const arms = [...new Set(rows.map((r) => r.arm))];

type Cell = { shipped: number; caught: number; clean: number; notes: string[] };
const table: Record<number, Record<string, Cell>> = {};
const header: Record<string, Cell> = {};
for (const a of arms) header[a] = { shipped: 0, caught: 0, clean: 0, notes: [] };
for (let n = 1; n <= 10; n++) { table[n] = {}; for (const a of arms) table[n][a] = { shipped: 0, caught: 0, clean: 0, notes: [] }; }

for (const r of rows) {
  const dir = join(runDir, `${r.task}__${r.arm}__t${r.trial}`);
  const attempts: Attempt[] = read(join(dir, 'attempts.jsonl')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const last = attempts[attempts.length - 1];
  const n = CONVENTION[r.task];
  const cell = table[n][r.arm];
  const label = `${r.task} ${r.arm} t${r.trial}`;
  const caught = attempts.some((a) => !a.ok && a.codes.some((c) => CAUGHT_BY[n].includes(c)));
  const flags = last?.ok ? scan(r.arm, join(dir, last.dir)) : {};
  // the convention this task aims at
  if (r.clean && !r.correct) { cell.shipped++; cell.notes.push(`${label}: broken (${(r.testError ?? '').slice(0, 60)})`); }
  else if (r.clean && flags[n]) { cell.shipped++; cell.notes.push(`${label}: violated, tests pass (${flags[n]})`); }
  else if (caught) { cell.caught++; cell.notes.push(`${label}: caught (${attempts.filter((a) => !a.ok).flatMap((a) => a.codes).filter((c) => CAUGHT_BY[n].includes(c)).join(', ')})`); }
  else if (r.clean) cell.clean++;
  else cell.notes.push(`${label}: never reached clean`);
  // the file-note rule is measured on every task that made a new file
  if (n !== 10 && last?.ok) {
    if (flags[10]) { header[r.arm].shipped++; header[r.arm].notes.push(`${label}: ${flags[10]}`); }
  }
}

const names: Record<number, string> = {
  1: 'client-callable fns return a Result', 2: 'errors are values, never thrown', 3: 'a Result is never ignored', 4: 'the secret stays on the server',
  5: 'nullable values are checked', 6: 'ids are distinct types', 7: 'money is integer cents via percentOf', 8: 'status changes go through transition',
  9: 'the server recomputes totals', 10: 'every file starts with a note',
};
const out: string[] = [`# Conventions in run ${runId}`, '', 'Cells are shipped / caught by the checker / clean, out of the runs on that convention\'s task.', '',
  `| # | convention | ${arms.join(' | ')} |`, `|---|---|${arms.map(() => '---').join('|')}|`];
for (let n = 1; n <= 10; n++) out.push(`| ${n} | ${names[n]} | ${arms.map((a) => { const c = table[n][a]; return `${c.shipped} / ${c.caught} / ${c.clean}`; }).join(' | ')} |`);
out.push('', `New files without a note on the other tasks: ${arms.map((a) => `${a} ${header[a].shipped}`).join(', ')}`, '', '## Every run that shipped, was caught, or never got clean', '');
for (let n = 1; n <= 10; n++) for (const a of arms) for (const note of table[n][a].notes) out.push(`- ${note}`);
for (const a of arms) for (const note of header[a].notes) out.push(`- ${note}`);
console.log(out.join('\n'));
