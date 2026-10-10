#!/usr/bin/env -S npx tsx
// This file runs Experiment 5: ten team conventions, written once in CONTRIBUTING.md, and three
// languages that enforce different subsets of them. Each helper gets the same invoicing app and
// the same change request, in TypeScript (checked by tsc and eslint), Rust (checked by cargo and
// clippy) or Tensium (checked by the Tensium compiler). Secret end-to-end tests then decide
// whether the app still works.
//
// No model calls happen here: helpers are driven from outside. This tool only sets up folders,
// gives compiler feedback, logs attempts and scores them.
//
//   init   --run ID [--arms ts,rs,tn] [--trials N] [--max-iter N] [--tasks a,b] [--model NAME] [--note TEXT]
//   submit <workdir>      check the app, log the attempt, print the compiler's feedback
//   score  <run ID>       run the hidden end-to-end tests on each final attempt and print the table
//   verify [--arms ...] [--tasks ...]   no helpers: the starter and every reference solution, in every arm
//   traps  [--arms ...] [--tasks ...]   no helpers: each task's tempting-but-wrong version through every arm's checker and the hidden tests

import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, toJSON } from '../src/index.ts';
import { languageReference } from './language.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = join(ROOT, 'runs');
const BASE = join(ROOT, 'harness', 'conventions');
const TASKS = join(BASE, 'tasks');
const CONTRIBUTING = join(BASE, 'app', 'CONTRIBUTING.md');
const TEST_KEY = 'test-webhook-secret-9c1d';
/** rustup was installed with --no-modify-path, so cargo is found here rather than on PATH. */
const CARGO = join(homedir(), '.cargo', 'bin', 'cargo');
/** One build folder for every Rust submission, so the dependencies are compiled once. */
const TARGET = join(RUNS, '_target', 'rs');
const LOCK = join(RUNS, '_target', 'rs.lock');

type Arm = 'ts' | 'rs' | 'tn';
const ARMS: Arm[] = ['ts', 'rs', 'tn'];
const STARTER: Record<Arm, string> = { ts: join(BASE, 'app', 'ts'), rs: join(BASE, 'app', 'rs'), tn: join(BASE, 'app', 'tn') };
/** Folders inside an app that are not its source: snapshots, build output and compiled output. */
const NOT_SOURCE = ['target', 'bin', 'out', 'node_modules', '.git'];

interface Meta { runId: string; task: string; arm: Arm; trial: number; maxIter: number; model?: string }
interface Attempt { n: number; at: string; ok: boolean; errors: number; codes: string[]; dir: string }
interface Check { ok: boolean; codes: string[]; feedback: string }

const argv = process.argv.slice(2);
const opt = (name: string, dflt?: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const readJSON = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8'));
const read = (p: string) => readFileSync(p, 'utf8');
const taskIds = () => readdirSync(TASKS).filter((t) => existsSync(join(TASKS, t, 'ticket.md'))).sort();
const armsFromArgs = (): Arm[] => {
  const arms = (opt('--arms')?.split(',') ?? ARMS) as Arm[];
  for (const a of arms) if (!ARMS.includes(a)) throw new Error(`unknown arm ${a}; use ${ARMS.join(', ')}`);
  return arms;
};
const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// ---- the app in each arm

/** Copies an app's source files (not its snapshots or build output). */
function copySource(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) {
    if (f.startsWith('attempt-') || NOT_SOURCE.includes(f)) continue;
    const p = join(src, f);
    if (statSync(p).isDirectory()) copySource(p, join(dst, f));
    else cpSync(p, join(dst, f));
  }
}

const TSCONFIG = `${JSON.stringify({
  compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true, skipLibCheck: true,
    allowImportingTsExtensions: true, types: ['node'], typeRoots: [join(ROOT, 'node_modules', '@types')],
  },
  include: ['shared/**/*.ts', 'server/**/*.ts', 'client/**/*.ts'],
}, null, 2)}
`;

/** Puts the starter app (plus the conventions) into a folder, then applies a task's patch if asked. Returns false if there is no such patch. */
function placeApp(arm: Arm, dir: string, from: 'starter' | string = 'starter', variant: 'solution' | 'trap' = 'solution'): boolean {
  copySource(STARTER[arm], dir);
  cpSync(CONTRIBUTING, join(dir, 'CONTRIBUTING.md'));
  if (arm === 'ts') writeFileSync(join(dir, 'tsconfig.json'), TSCONFIG);
  if (from === 'starter') return true;
  const patch = join(TASKS, from, variant, `${arm}.patch`);
  if (!existsSync(patch)) return false;
  const r = spawnSync('patch', ['-p1', '-s', '-i', patch], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`patch ${patch} failed: ${r.stdout}${r.stderr}`);
  return true;
}

// ---- the three checkers

function checkTs(dir: string): Check {
  const tsc = spawnSync(join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', dir, '--pretty', 'false'], { encoding: 'utf8' });
  const tscOut = (tsc.stdout + tsc.stderr).trim();
  const codes = [...tscOut.matchAll(/error (TS\d+)/g)].map((m) => m[1]);
  const lint = spawnSync(join(ROOT, 'node_modules', '.bin', 'eslint'), ['--config', join(BASE, 'eslint.config.mjs'), '--format', 'json', join(dir, 'shared'), join(dir, 'server'), join(dir, 'client')], { encoding: 'utf8' });
  const lines: string[] = [];
  try {
    for (const file of JSON.parse(lint.stdout) as { filePath: string; messages: { line: number; column: number; message: string; ruleId: string | null; severity: number }[] }[]) {
      for (const m of file.messages) {
        if (m.severity < 2) continue;
        codes.push(m.ruleId ?? 'eslint');
        lines.push(`${file.filePath.replace(dir + '/', '')}(${m.line},${m.column}): error ${m.ruleId ?? 'eslint'}: ${m.message}`);
      }
    }
  } catch { lines.push('eslint could not run: ' + (lint.stderr || lint.stdout).trim()); codes.push('eslint'); }
  const feedback = [tscOut, lines.join('\n')].filter(Boolean).join('\n');
  return { ok: codes.length === 0, codes, feedback };
}

/** Builds are serialised through one lock, because every submission shares the Rust build folder. */
function withBuildLock<T>(fn: () => T): T {
  mkdirSync(dirname(LOCK), { recursive: true });
  for (let i = 0; ; i++) {
    try { mkdirSync(LOCK); break; } catch {
      if (existsSync(LOCK) && Date.now() - statSync(LOCK).mtimeMs > 10 * 60 * 1000) { rmSync(LOCK, { recursive: true, force: true }); continue; }
      if (i > 2400) throw new Error('could not get the Rust build lock');
      sleep(500);
    }
  }
  try { return fn(); } finally { rmSync(LOCK, { recursive: true, force: true }); }
}

interface CargoMsg { reason: string; message?: { rendered?: string; level: string; code: { code: string } | null; message: string } }

function cargo(args: string[], dir: string): { ok: boolean; codes: string[]; text: string } {
  // cargo's own flags go before `--`; anything after it is for clippy-driver
  const dash = args.indexOf('--');
  const argv2 = dash < 0 ? [...args, '--message-format=json'] : [...args.slice(0, dash), '--message-format=json', ...args.slice(dash)];
  const r = spawnSync(CARGO, argv2, { cwd: dir, encoding: 'utf8', env: { ...process.env, CARGO_TARGET_DIR: TARGET, PATH: `${dirname(CARGO)}:${process.env.PATH}` }, maxBuffer: 64 * 1024 * 1024 });
  const codes: string[] = [];
  const text: string[] = [];
  for (const line of r.stdout.split('\n')) {
    if (!line.startsWith('{')) continue;
    let m: CargoMsg;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.reason !== 'compiler-message' || !m.message) continue;
    const { level, code, rendered, message } = m.message;
    if (level !== 'error' && level !== 'warning') continue;
    if (/^aborting due to|generated \d+ warning|could not compile/.test(message)) continue;
    codes.push(code?.code ?? level);
    if (rendered && !text.includes(rendered)) text.push(rendered);
  }
  if (r.status !== 0 && codes.length === 0) text.push((r.stderr || '').trim().split('\n').slice(-5).join('\n'));
  return { ok: r.status === 0 && codes.length === 0, codes, text: text.join('\n') };
}

/** cargo build, then clippy with warnings as errors; on success the two programs are copied to <binDir>. */
function checkRs(dir: string, binDir: string): Check {
  return withBuildLock(() => {
    const build = cargo(['build'], dir);
    if (!build.ok) return { ok: false, codes: build.codes, feedback: build.text };
    const clippy = cargo(['clippy', '--', '-D', 'warnings'], dir);
    if (!clippy.ok) return { ok: false, codes: clippy.codes, feedback: clippy.text };
    mkdirSync(binDir, { recursive: true });
    for (const b of ['server', 'client']) cpSync(join(TARGET, 'debug', b), join(binDir, b));
    return { ok: true, codes: [], feedback: '' };
  });
}

function checkTn(dir: string, outDir: string): Check {
  const r = compile(read(join(dir, 'app.tn')), 'app.tn');
  if (r.ok) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'server.ts'), r.server!);
    writeFileSync(join(outDir, 'client.ts'), r.client!);
  }
  return { ok: r.ok, codes: r.diagnostics.map((d) => d.code), feedback: toJSON(r.diagnostics) };
}

/** Checks the app in `dir`; build output (Rust programs, Tensium's TypeScript) goes under `outRoot`. */
function check(arm: Arm, dir: string, outRoot: string): Check {
  if (arm === 'ts') return checkTs(dir);
  if (arm === 'rs') return checkRs(dir, join(outRoot, 'bin'));
  return checkTn(dir, join(outRoot, 'out'));
}

function e2e(arm: Arm, dir: string, tests: string): { ok: boolean; error?: string } {
  const r = spawnSync('npx', ['tsx', join(ROOT, 'harness', 'conventions-e2e.ts'), arm, dir, tests], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, WEBHOOK_SECRET: TEST_KEY }, timeout: 180000, maxBuffer: 16 * 1024 * 1024,
  });
  const m = /__RESULT__(\{.*\})/.exec(r.stdout);
  return m ? JSON.parse(m[1]) : { ok: false, error: 'test rig crashed: ' + (r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | ') };
}

// ---- init

function brief(dir: string, meta: Meta, ticket: string, langPath: string): string {
  const submit = `npx tsx harness/conventions.ts submit ${dir}`;
  const intro = {
    ts: `You are working on a small client/server invoicing app written in TypeScript, in \`${dir}\`:

- \`shared/types.ts\` holds the record types both halves use.
- \`server/\` runs on the server (\`server/rpc.ts\` lists the functions the client may call).
- \`client/\` runs in the browser (\`client/index.ts\` lists the screens).

The client calls the server over HTTP: \`POST /rpc/<function name>\` with a JSON array of the arguments.`,
    rs: `You are working on a small client/server invoicing app written in Rust, in \`${dir}\`. It is a Cargo workspace with three crates:

- \`shared/\` holds the record types and helpers both halves use.
- \`server/\` is the server program (\`server/src/rpc.rs\` lists the functions the client may call).
- \`client/\` is the client program (\`client/src/main.rs\` lists the screens; it is run as \`client <url> <screen> <json array of arguments>\` and prints the screen's text).

The client calls the server over HTTP: \`POST /rpc/<function name>\` with a JSON array of the arguments.`,
    tn: `You are working on a small client/server invoicing app written in the Tensium language. The whole app, both halves, is in one file: \`${join(dir, 'app.tn')}\`.

Read the language reference first: \`${langPath}\``,
  }[meta.arm];
  const checker = { ts: 'the TypeScript compiler (`tsc --strict`) and eslint', rs: '`cargo build` and `cargo clippy` (warnings count as errors)', tn: 'the Tensium compiler' }[meta.arm];
  const keep = {
    ts: '\n- Keep the wire format (`POST /rpc/<function name>`, JSON array of arguments) and do not rename or change the signature of `serve` in server/rpc.ts or `connect` in client/rpc.ts; the app is started and tested through them.',
    rs: '\n- Keep the wire format (`POST /rpc/<function name>`, JSON array of arguments), keep the `server` and `client` program names, how `server` is started and prints `LISTENING <url>`, and how `client` is called (`client <url> <screen> <json args>`); the app is started and tested through them.',
    tn: '',
  }[meta.arm];
  return `# Task

${intro}

The team's conventions are in \`${join(dir, 'CONTRIBUTING.md')}\`. Read them before you start.

## Change request

${ticket.trim()}

Everything else the app does must keep working exactly as before.

## How to work

1. Make the change by editing the app's file${meta.arm === 'tn' ? '' : 's'}.
2. Submit your work for checking with (from \`${ROOT}\`):

       ${submit}

   The output is the feedback of ${checker} on your current files. Fix what it reports and submit again.
3. You have at most ${meta.maxIter} submissions. Stop as soon as a submission reports \`OK\`, or the limit is reached.

Rules of the exercise (important for the experiment to be valid):
- Only read and write files inside \`${dir}\`${meta.arm === 'tn' ? ' plus the language reference above' : ''}. Do NOT read \`${join(ROOT, 'src')}\`, \`${join(ROOT, 'harness')}\`, \`${join(ROOT, 'test')}\`, \`${join(ROOT, 'examples')}\`, any other run directory, or \`meta.json\`.
- Do NOT run any compiler, linter, the app, or any tests yourself. The submit command above is your only feedback.${keep}
- Your final reply should be one line: whether your last submission was OK.
`;
}

function init(): void {
  const runId = opt('--run');
  if (!runId) throw new Error('--run ID is required');
  const arms = armsFromArgs();
  const trials = Number(opt('--trials', '1'));
  const maxIter = Number(opt('--max-iter', '6'));
  const model = opt('--model');
  const only = opt('--tasks')?.split(',');
  const tasks = taskIds().filter((t) => !only || only.includes(t));
  const runDir = join(RUNS, runId);
  mkdirSync(runDir, { recursive: true });
  const langPath = join(runDir, 'LANGUAGE.md');
  writeFileSync(langPath, languageReference('terse'));
  writeFileSync(join(runDir, 'NOTE.txt'), `suite: conventions; arms: ${arms.join(', ')}${model ? `; agents: ${model}` : ''}${opt('--note') ? `; ${opt('--note')}` : ''}\n`);
  const dirs: string[] = [];
  for (const task of tasks) for (const arm of arms) for (let trial = 1; trial <= trials; trial++) {
    const dir = join(runDir, `${task}__${arm}__t${trial}`);
    mkdirSync(dir, { recursive: true });
    const meta: Meta = { runId, task, arm, trial, maxIter, model };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
    placeApp(arm, dir);
    const ticket = read(join(TASKS, task, 'ticket.md')).replace(/^<!--[\s\S]*?-->\s*/, '');
    writeFileSync(join(dir, 'TASK.md'), brief(dir, meta, ticket, langPath));
    dirs.push(dir);
  }
  writeFileSync(join(runDir, 'workdirs.json'), JSON.stringify(dirs, null, 2));
  console.log(JSON.stringify({ runId, runDir, count: dirs.length, workdirs: dirs }, null, 2));
}

// ---- submit

const attemptsOf = (dir: string): Attempt[] => {
  const log = join(dir, 'attempts.jsonl');
  return existsSync(log) ? read(log).split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};

function submit(): void {
  const dir = resolve(argv[1] ?? '');
  if (!existsSync(join(dir, 'meta.json'))) { console.error(`not a work directory: ${dir}`); process.exit(2); }
  const meta = readJSON<Meta>(join(dir, 'meta.json'));
  const attempts = attemptsOf(dir);
  if (attempts.some((a) => a.ok)) { console.log('Already submitted successfully; nothing more to do.'); return; }
  if (attempts.length >= meta.maxIter) { console.log(`Iteration limit (${meta.maxIter}) reached; no further submissions accepted.`); return; }
  const n = attempts.length + 1;
  const snap = `attempt-${n}`;
  copySource(dir, join(dir, snap));
  const r = check(meta.arm, dir, join(dir, snap));
  appendFileSync(join(dir, 'attempts.jsonl'), JSON.stringify({
    n, at: new Date().toISOString(), ok: r.ok, errors: r.codes.length, codes: r.codes, dir: snap,
  } satisfies Attempt) + '\n');
  console.log(`[submission ${n}/${meta.maxIter}]`);
  if (r.ok) console.log('OK: no errors. Your submission is recorded. You are done.');
  else {
    console.log(r.feedback);
    console.log(n >= meta.maxIter ? '(iteration limit reached)' : `(${meta.maxIter - n} submission(s) left)`);
  }
}

// ---- score

interface Row {
  task: string; arm: Arm; trial: number; attempts: number; clean: boolean; correct: boolean; firstTryClean: boolean;
  codes: string[]; testError?: string;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f1 = (x: number) => (Number.isNaN(x) ? '—' : x.toFixed(1));

function score(): void {
  const runId = argv[1];
  if (!runId) { console.error('usage: score <run ID>'); process.exit(2); }
  const runDir = join(RUNS, runId);
  const rows: Row[] = [];
  let maxIter = 0;
  for (const dir of readJSON<string[]>(join(runDir, 'workdirs.json'))) {
    const meta = readJSON<Meta>(join(dir, 'meta.json'));
    maxIter = meta.maxIter;
    const attempts = attemptsOf(dir);
    const last = attempts[attempts.length - 1];
    const row: Row = {
      task: meta.task, arm: meta.arm, trial: meta.trial, attempts: attempts.length, clean: !!last?.ok, correct: false,
      firstTryClean: !!attempts[0]?.ok, codes: attempts.flatMap((a) => a.codes),
    };
    if (last?.ok) {
      const r = e2e(meta.arm, join(dir, last.dir), join(TASKS, meta.task, 'tests.ts'));
      row.correct = r.ok;
      row.testError = r.error;
    } else row.testError = last ? 'never passed its own compiler' : 'no submission';
    rows.push(row);
    console.error(`${meta.task} ${meta.arm} t${meta.trial}: ${row.clean ? (row.correct ? 'correct' : 'clean but broken: ' + row.testError) : row.testError}`);
  }
  writeFileSync(join(runDir, 'results.json'), JSON.stringify(rows, null, 2));
  const arms = ARMS.filter((a) => rows.some((r) => r.arm === a));
  const tasks = [...new Set(rows.map((r) => r.task))];
  const cell = (rs: Row[]) => [f1(mean(rs.filter((r) => r.clean).map((r) => r.attempts))), `${rs.filter((r) => r.correct).length}/${rs.length}`];
  const note = existsSync(join(runDir, 'NOTE.txt')) ? read(join(runDir, 'NOTE.txt')).trim() : '';
  const head = ['task', ...arms.flatMap((a) => [`${a} iters`, `${a} correct`])];
  const out = [`# Results: ${runId}`, '', `Setup: ${note}`, '',
    `iters = mean submissions until the arm's own checker reported OK (max ${maxIter}). correct = the hidden end-to-end tests pass.`, '',
    `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const t of tasks) out.push(`| ${t} | ${arms.flatMap((a) => cell(rows.filter((r) => r.task === t && r.arm === a))).join(' | ')} |`);
  out.push(`| **all tasks** | ${arms.flatMap((a) => cell(rows.filter((r) => r.arm === a)).map((c) => `**${c}**`)).join(' | ')} |`, '',
    '| arm | runs | checker-clean | correct | clean but broken | first-try clean | mean iters (clean only) |', '|---|---|---|---|---|---|---|');
  for (const a of arms) {
    const rs = rows.filter((r) => r.arm === a);
    const clean = rs.filter((r) => r.clean);
    out.push(`| ${a} | ${rs.length} | ${clean.length} | ${rs.filter((r) => r.correct).length} | ${clean.filter((r) => !r.correct).length} | ${rs.filter((r) => r.firstTryClean).length} | ${f1(mean(clean.map((r) => r.attempts)))} |`);
  }
  const bad = rows.filter((r) => !r.correct);
  if (bad.length) out.push('', 'Runs that did not end correct:', ...bad.map((r) => `- ${r.task} [${r.arm} t${r.trial}] ${r.clean ? 'checker-clean, but' : ''} ${r.testError}`.replace(/\s+/g, ' ')));
  const report = out.join('\n');
  writeFileSync(join(runDir, 'report.md'), report);
  console.log(report);
}

// ---- verify and traps (no helpers)

function scratchDir(name: string): string {
  const dir = join(RUNS, '_conventions', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

function verify(): void {
  let failures = 0;
  const expect = (label: string, got: boolean, want: boolean, detail = '') => {
    const good = got === want;
    if (!good) failures++;
    console.log(`${good ? 'ok  ' : 'FAIL'} ${label}${good ? '' : `  (expected ${want ? 'pass' : 'fail'}) ${detail}`}`);
  };
  const only = opt('--tasks')?.split(',');
  for (const arm of armsFromArgs()) {
    const starter = scratchDir(`starter__${arm}`);
    placeApp(arm, starter);
    const c = check(arm, starter, starter);
    expect(`${arm}: starter passes its checker`, c.ok, true, c.feedback.slice(0, 300));
    const base = e2e(arm, starter, join(BASE, 'baseline.tests.ts'));
    expect(`${arm}: starter passes the baseline tests`, base.ok, true, base.error);
    for (const task of taskIds().filter((t) => !only || only.includes(t))) {
      const tests = join(TASKS, task, 'tests.ts');
      expect(`${arm}: starter does NOT already pass ${task}`, e2e(arm, starter, tests).ok, false);
      const sol = scratchDir(`${task}__${arm}`);
      if (!placeApp(arm, sol, task, 'solution')) { expect(`${arm}: ${task} has a reference solution`, false, true); continue; }
      const sc = check(arm, sol, sol);
      expect(`${arm}: ${task} solution passes its checker`, sc.ok, true, sc.feedback.slice(0, 400));
      if (sc.ok) { const r = e2e(arm, sol, tests); expect(`${arm}: ${task} solution passes the hidden tests`, r.ok, true, r.error); }
    }
  }
  console.log(failures ? `\n${failures} problem(s)` : '\nall good');
  process.exit(failures ? 1 : 0);
}

function traps(): void {
  const lines = ['| task | arm | its checker says | hidden end-to-end tests |', '|---|---|---|---|'];
  const only = opt('--tasks')?.split(',');
  for (const task of taskIds().filter((t) => !only || only.includes(t))) {
    for (const arm of armsFromArgs()) {
      const dir = scratchDir(`trap_${task}__${arm}`);
      if (!placeApp(arm, dir, task, 'trap')) { lines.push(`| ${task} | ${arm} | (no tempting version: it cannot be written in this arm) | — |`); continue; }
      const c = check(arm, dir, dir);
      if (!c.ok) { lines.push(`| ${task} | ${arm} | rejected: ${[...new Set(c.codes)].slice(0, 3).join(', ')} | never ships |`); continue; }
      const r = e2e(arm, dir, join(TASKS, task, 'tests.ts'));
      lines.push(`| ${task} | ${arm} | accepted | ${r.ok ? 'PASS (the tests do not catch it)' : `FAIL: ${(r.error ?? '').slice(0, 60)}`} |`);
    }
  }
  console.log(lines.join('\n'));
}

const cmd = argv[0];
if (cmd === 'init') init();
else if (cmd === 'submit') submit();
else if (cmd === 'score') score();
else if (cmd === 'verify') verify();
else if (cmd === 'traps') traps();
else { console.error('usage: conventions.ts init|submit|score|verify|traps ...'); process.exit(2); }
