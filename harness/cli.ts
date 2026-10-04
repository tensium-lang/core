#!/usr/bin/env -S npx tsx
// This file runs the experiment that tests our big idea: do computer helpers fix their
// mistakes faster when mistakes are reported in a clear, structured way? "init" sets up a
// folder for each task, "submit" checks a helper's answer and tells it what went wrong, and
// "score" counts how many tries each helper needed and whether the final answer really works.

// Experiment harness. No model calls: agents are driven externally (e.g. Claude Code subagents),
// this tool only creates work directories, gives structured/prose feedback, logs attempts, and scores them.
//
//   init   [--run ID] [--arms A=prose,B=json] [--trials N] [--max-iter N] [--tasks a,b] [--reference full|terse] [--note TEXT]
//   submit <workdir>             check solution.tn, log the attempt, print feedback in this workdir's arm format
//   score  <run ID>              run hidden tests on each final attempt, write results.json + report.md, print table
//   autofix <run ID>             no model: apply the checker's own suggested edits to every FAILED attempt, see how many
//                                become clean and correct (measures the diagnostics, not the agents)

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyFixes } from '../src/fix.ts';
import { compile, toJSON, toProse } from '../src/index.ts';
import { ReferenceKind, languageReference } from './language.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TASKS = join(ROOT, 'harness', 'tasks');
const RUNS = join(ROOT, 'runs');

type Format = 'prose' | 'json';
interface Meta { runId: string; task: string; arm: string; format: Format; trial: number; maxIter: number }
interface Attempt { n: number; at: string; ok: boolean; errors: number; codes: string[]; file: string }

const argv = process.argv.slice(2);
const opt = (name: string, dflt?: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const readJSON = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8'));

function init(): void {
  const runId = opt('--run', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19))!;
  const arms = opt('--arms', 'A=prose,B=json')!.split(',').map((a) => {
    const [name, format] = a.split('=');
    if (format !== 'prose' && format !== 'json') throw new Error(`arm ${a}: format must be prose or json`);
    return { name, format: format as Format };
  });
  const trials = Number(opt('--trials', '1'));
  const maxIter = Number(opt('--max-iter', '5'));
  const only = opt('--tasks')?.split(',');
  const tasks = readdirSync(TASKS).filter((t) => existsSync(join(TASKS, t, 'prompt.md')) && (!only || only.includes(t))).sort();
  const runDir = join(RUNS, runId);
  mkdirSync(runDir, { recursive: true });
  const langPath = join(runDir, 'LANGUAGE.md');
  const reference = opt('--reference', 'full') as ReferenceKind;
  if (reference !== 'full' && reference !== 'terse') throw new Error('--reference must be full or terse');
  writeFileSync(langPath, languageReference(reference));
  // Free text recorded with the run (e.g. which model drove the agents); shown at the top of the report.
  writeFileSync(join(runDir, 'NOTE.txt'), `reference: ${reference}${opt('--note') ? `; ${opt('--note')}` : ''}\n`);

  const dirs: string[] = [];
  for (const task of tasks) for (const arm of arms) for (let trial = 1; trial <= trials; trial++) {
    const dir = join(runDir, `${task}__${arm.name}__t${trial}`);
    mkdirSync(dir, { recursive: true });
    const meta: Meta = { runId, task, arm: arm.name, format: arm.format, trial, maxIter };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
    writeFileSync(join(dir, 'solution.tn'), '');
    writeFileSync(join(dir, 'TASK.md'), taskBrief(dir, langPath, readFileSync(join(TASKS, task, 'prompt.md'), 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '') /* drop the plain-words file note */, maxIter));
    dirs.push(dir);
  }
  writeFileSync(join(runDir, 'workdirs.json'), JSON.stringify(dirs, null, 2));
  console.log(JSON.stringify({ runId, runDir, count: dirs.length, workdirs: dirs }, null, 2));
}

function taskBrief(dir: string, langPath: string, prompt: string, maxIter: number): string {
  return `# Task

${prompt.trim()}

# How to work

You write the program in the Tensium language. Read the language reference first: \`${langPath}\`

1. Write your solution to \`${join(dir, 'solution.tn')}\`.
2. Submit it for checking with (from \`${ROOT}\`):

       npx tsx harness/cli.ts submit ${dir}

   The output is the compiler's feedback on your latest solution. Fix the problems it reports, edit \`solution.tn\`, and submit again.
3. You have at most ${maxIter} submissions. Stop as soon as a submission reports \`OK\`, or the limit is reached.

Rules of the exercise (important for the experiment to be valid):
- Only read/write files inside \`${dir}\` plus the language reference above. Do NOT read \`${join(ROOT, 'src')}\`, \`${join(ROOT, 'harness')}\`, \`${join(ROOT, 'test')}\`, \`${join(ROOT, 'examples')}\`, any other run directory, or \`meta.json\`.
- Do NOT run the compiler any way other than the submit command above, and do not try to write tests or run your code. The submit feedback is your only signal.
- Your final reply should be one line: whether your last submission was OK.
`;
}

function submit(): void {
  const dir = resolve(argv[1] ?? '');
  const metaPath = join(dir, 'meta.json');
  if (!existsSync(metaPath)) { console.error(`not a work directory: ${dir}`); process.exit(2); }
  const meta = readJSON<Meta>(metaPath);
  const logPath = join(dir, 'attempts.jsonl');
  const attempts: Attempt[] = existsSync(logPath)
    ? readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  if (attempts.some((a) => a.ok)) { console.log('Already submitted successfully; nothing more to do.'); return; }
  if (attempts.length >= meta.maxIter) { console.log(`Iteration limit (${meta.maxIter}) reached; no further submissions accepted.`); return; }

  const source = readFileSync(join(dir, 'solution.tn'), 'utf8');
  const n = attempts.length + 1;
  const snapshot = `attempt-${n}.tn`;
  writeFileSync(join(dir, snapshot), source);
  const result = compile(source, 'solution.tn');
  const errors = result.diagnostics.filter((d) => d.severity === 'error').length;
  appendFileSync(logPath, JSON.stringify({
    n, at: new Date().toISOString(), ok: result.ok, errors, codes: result.diagnostics.map((d) => d.code), file: snapshot,
  } satisfies Attempt) + '\n');

  console.log(`[submission ${n}/${meta.maxIter}]`);
  if (result.ok) console.log('OK: no errors. Your submission is recorded. You are done.');
  else {
    console.log(meta.format === 'json' ? toJSON(result.diagnostics) : toProse(result.diagnostics));
    console.log(n >= meta.maxIter ? '(iteration limit reached)' : `(${meta.maxIter - n} submission(s) left)`);
  }
}

interface Row {
  task: string; arm: string; trial: number; attempts: number; clean: boolean; correct: boolean;
  firstTryClean: boolean; codes: string[]; testError?: string;
}

async function score(): Promise<void> {
  const runId = argv[1];
  if (!runId) { console.error('usage: score <run ID>'); process.exit(2); }
  const runDir = join(RUNS, runId);
  const dirs = readJSON<string[]>(join(runDir, 'workdirs.json'));
  const rows: Row[] = [];
  let maxIter = 0;
  const armOrder: string[] = [];
  for (const dir of dirs) {
    const meta = readJSON<Meta>(join(dir, 'meta.json'));
    maxIter = meta.maxIter;
    if (!armOrder.includes(meta.arm)) armOrder.push(meta.arm);
    const logPath = join(dir, 'attempts.jsonl');
    const attempts: Attempt[] = existsSync(logPath)
      ? readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    const last = attempts[attempts.length - 1];
    const row: Row = {
      task: meta.task, arm: meta.arm, trial: meta.trial, attempts: attempts.length,
      clean: !!last?.ok, correct: false, firstTryClean: !!attempts[0]?.ok,
      codes: attempts.flatMap((a) => a.codes),
    };
    if (row.clean) {
      const src = readFileSync(join(dir, last.file), 'utf8');
      const ts = compile(src, 'solution.tn').ts!;
      const tsPath = join(dir, 'final.ts');
      writeFileSync(tsPath, ts);
      row.testError = await runHiddenTests(meta.task, tsPath);
      row.correct = row.testError === undefined;
    }
    rows.push(row);
  }
  writeFileSync(join(runDir, 'results.json'), JSON.stringify(rows, null, 2));
  const report = renderReport(runId, rows, armOrder, maxIter);
  writeFileSync(join(runDir, 'report.md'), report);
  console.log(report);
}

/** Runs a task's hidden tests against emitted TypeScript; returns undefined on success, else the first line of the failure. */
async function runHiddenTests(task: string, tsPath: string): Promise<string | undefined> {
  try {
    const mod = await import(pathToFileURL(tsPath).href);
    const tests = (await import(pathToFileURL(join(TASKS, task, 'tests.ts')).href)).default;
    tests(mod);
    return undefined;
  } catch (e) { return e instanceof Error ? e.message.split('\n')[0] : String(e); }
}

interface FixRow { task: string; arm: string; trial: number; attempt: number; firstCode: string; codes: string[]; clean: boolean; correct: boolean; rounds: number; applied: number; testError?: string }

async function autofix(): Promise<void> {
  const runId = argv[1];
  if (!runId) { console.error('usage: autofix <run ID>'); process.exit(2); }
  const runDir = join(RUNS, runId);
  const rows: FixRow[] = [];
  for (const dir of readJSON<string[]>(join(runDir, 'workdirs.json'))) {
    const meta = readJSON<Meta>(join(dir, 'meta.json'));
    const logPath = join(dir, 'attempts.jsonl');
    if (!existsSync(logPath)) continue;
    const attempts: Attempt[] = readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    for (const a of attempts.filter((x) => !x.ok)) {
      const fixed = applyFixes(readFileSync(join(dir, a.file), 'utf8'), 'solution.tn');
      const row: FixRow = { task: meta.task, arm: meta.arm, trial: meta.trial, attempt: a.n, firstCode: a.codes[0] ?? '?', codes: a.codes,
        clean: fixed.ok, correct: false, rounds: fixed.rounds, applied: fixed.applied };
      if (fixed.ok) {
        const tsPath = join(dir, `autofix-${a.n}.ts`);
        writeFileSync(tsPath, compile(fixed.source, 'solution.tn').ts!);
        row.testError = await runHiddenTests(meta.task, tsPath);
        row.correct = row.testError === undefined;
      }
      rows.push(row);
    }
  }
  writeFileSync(join(runDir, 'autofix.json'), JSON.stringify(rows, null, 2));
  const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—');
  const group = (key: (r: FixRow) => string) => {
    const m = new Map<string, FixRow[]>();
    for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return [...m.entries()].sort();
  };
  const out = [`# Autofix: ${runId}`, '', `Applying only the checker's own suggested edits (no model) to every failed submission (${rows.length}).`, '',
    '| group | failed submissions | made clean | clean and passes hidden tests | mean rounds (clean) |', '|---|---|---|---|---|'];
  const line = (name: string, rs: FixRow[]) => out.push(`| ${name} | ${rs.length} | ${rs.filter((r) => r.clean).length} (${pct(rs.filter((r) => r.clean).length, rs.length)}) | ${rs.filter((r) => r.correct).length} (${pct(rs.filter((r) => r.correct).length, rs.length)}) | ${f1(mean(rs.filter((r) => r.clean).map((r) => r.rounds)))} |`);
  line('**all failed submissions**', rows);
  for (const [code, rs] of group((r) => r.firstCode)) line(`first diagnostic ${code}`, rs);
  const bad = rows.filter((r) => r.clean && !r.correct);
  if (bad.length) out.push('', 'Fixed to a clean program that fails the hidden tests:', ...bad.map((r) => `- ${r.task} [${r.arm} t${r.trial} #${r.attempt}] ${r.codes.join(',')}: ${r.testError}`));
  const report = out.join('\n');
  writeFileSync(join(runDir, 'autofix.md'), report);
  console.log(report);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f1 = (x: number) => (Number.isNaN(x) ? '—' : x.toFixed(1));

function renderReport(runId: string, rows: Row[], arms: string[], maxIter: number): string {
  const tasks = [...new Set(rows.map((r) => r.task))];
  const cell = (rs: Row[]) => {
    const clean = rs.filter((r) => r.clean);
    return [f1(mean(clean.map((r) => r.attempts))), `${rs.filter((r) => r.correct).length}/${rs.length}`];
  };
  const head = ['task', ...arms.flatMap((a) => [`${a} iters`, `${a} correct`])];
  const note = existsSync(join(RUNS, runId, 'NOTE.txt')) ? readFileSync(join(RUNS, runId, 'NOTE.txt'), 'utf8').trim() : '';
  const lines = [`# Results: ${runId}`, '', ...(note ? [`Setup: ${note}`, ''] : []), `iters = mean submissions until the checker reported OK (over runs that got there; max ${maxIter}). correct = passed hidden tests.`, '',
    `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const t of tasks) {
    lines.push(`| ${t} | ${arms.flatMap((a) => cell(rows.filter((r) => r.task === t && r.arm === a))).join(' | ')} |`);
  }
  const total = arms.map((a) => rows.filter((r) => r.arm === a));
  lines.push(`| **all tasks** | ${total.flatMap((rs) => cell(rs).map((c) => `**${c}**`)).join(' | ')} |`, '');
  lines.push('| arm | runs | clean | correct | first-try clean | mean iters (clean only) | mean iters (fail = max+1) | total diagnostics seen |', '|---|---|---|---|---|---|---|---|');
  arms.forEach((a, i) => {
    const rs = total[i];
    lines.push(`| ${a} | ${rs.length} | ${rs.filter((r) => r.clean).length} | ${rs.filter((r) => r.correct).length} | ${rs.filter((r) => r.firstTryClean).length} | ` +
      `${f1(mean(rs.filter((r) => r.clean).map((r) => r.attempts)))} | ${f1(mean(rs.map((r) => (r.clean ? r.attempts : maxIter + 1))))} | ${rs.reduce((s, r) => s + r.codes.length, 0)} |`);
  });
  const bad = rows.filter((r) => r.clean && !r.correct);
  if (bad.length) lines.push('', 'Checker-clean but failed hidden tests:', ...bad.map((r) => `- ${r.task} [${r.arm} t${r.trial}]: ${r.testError}`));
  return lines.join('\n');
}

const cmd = argv[0];
if (cmd === 'init') init();
else if (cmd === 'submit') submit();
else if (cmd === 'score') await score();
else if (cmd === 'autofix') await autofix();
else { console.error('usage: init | submit <workdir> | score <run ID> | autofix <run ID>'); process.exit(2); }
void basename;
