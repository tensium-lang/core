#!/usr/bin/env -S npx tsx
// This file runs the second experiment: does a compiler that guards the line between client and
// server help a computer helper change a two-sided app without breaking it? Each helper gets the
// same small shop app and the same change request, written either in Tensium (one file, checked
// by the Tensium compiler) or in ordinary TypeScript (separate server and client files, checked
// by tsc). Secret end-to-end tests then decide whether the app still works.
//
// No model calls happen here: helpers are driven from outside. This tool only sets up folders,
// gives compiler feedback, logs attempts and scores them.
//
//   init   --run ID [--arms tn,ts-shared,ts-split] [--trials N] [--max-iter N] [--tasks a,b] [--note TEXT]
//   submit <workdir>      check the app, log the attempt, print the compiler's feedback
//   score  <run ID>       run the hidden end-to-end tests on each final attempt and print the table
//   verify                no helpers: check the starter app and the reference solutions in every arm
//   drift                 no helpers: plant three classic client/server mistakes in every arm and see which compiler notices

import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, toJSON } from '../src/index.ts';
import { languageReference } from './language.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const B = join(ROOT, 'harness', 'boundary');
const TASKS = join(B, 'tasks');
const RUNS = join(ROOT, 'runs');
const TEST_KEY = 'test-signing-key-7f3a';

/** tn = Tensium; ts-shared = TypeScript with one shared types file; ts-split = TypeScript where each side has its own copy of the types. */
type Arm = 'tn' | 'ts-shared' | 'ts-split';
const ARMS: Arm[] = ['tn', 'ts-shared', 'ts-split'];
type Files = Record<string, string>;
interface Meta { runId: string; task: string; arm: Arm; trial: number; maxIter: number }
interface Attempt { n: number; at: string; ok: boolean; errors: number; codes: string[]; dir: string }

const argv = process.argv.slice(2);
const opt = (name: string, dflt?: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const readJSON = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8'));
const read = (p: string) => readFileSync(p, 'utf8');
const taskIds = () => readdirSync(TASKS).filter((t) => existsSync(join(TASKS, t, 'ticket.md'))).sort();

// ---- the app in each arm

/** The split variant is made from the shared one: each side gets its own copy of the types instead of importing them. */
function splitFrom(shared: Files): Files {
  const types = shared['types.ts'].split('\n').filter((l) => !l.startsWith('//')).join('\n').trim().replace(/^export /gm, '');
  const block = `// The record types this file uses. The other half of the app has its own copy.\n${types}\n`;
  const inline = (src: string) => {
    const out = src.replace(/^import type \{[^}]*\} from '\.\/types\.ts';\n/m, block);
    if (out === src) throw new Error('expected an import of ./types.ts to replace');
    return out;
  };
  return { 'server.ts': inline(shared['server.ts']), 'client.ts': inline(shared['client.ts']) };
}

function appFiles(arm: Arm, from: 'starter' | string): Files {
  if (arm === 'tn') return { 'app.tn': read(from === 'starter' ? join(ROOT, 'examples', 'shop.tn') : join(TASKS, from, 'solution', 'app.tn')) };
  const dir = from === 'starter' ? join(B, 'app', 'ts') : join(TASKS, from, 'solution');
  const shared: Files = Object.fromEntries(['types.ts', 'server.ts', 'client.ts'].map((f) => [f, read(join(dir, f))]));
  return arm === 'ts-shared' ? shared : splitFrom(shared);
}

const TSCONFIG = `// Settings for the TypeScript checker, written by the experiment tool on every submit.
${JSON.stringify({
  compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true, skipLibCheck: true,
    allowImportingTsExtensions: true, types: ['node'], typeRoots: [join(ROOT, 'node_modules', '@types')],
  },
  files: ['server.ts', 'client.ts'],
}, null, 2)}
`;

/** The source files of an app folder (not the tool's own files, and not earlier snapshots). */
const sourceFiles = (dir: string) => readdirSync(dir).filter((f) => (f.endsWith('.ts') || f.endsWith('.tn')) && !f.startsWith('attempt-'));

/** Runs the arm's own compiler over an app folder. */
function check(dir: string, arm: Arm): { ok: boolean; feedback: string; codes: string[] } {
  if (arm === 'tn') {
    const r = compile(read(join(dir, 'app.tn')), 'app.tn');
    return { ok: r.ok, feedback: toJSON(r.diagnostics), codes: r.diagnostics.map((d) => d.code) };
  }
  writeFileSync(join(dir, 'tsconfig.json'), TSCONFIG);
  const r = spawnSync(join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', '.', '--pretty', 'false'], { cwd: dir, encoding: 'utf8' });
  const out = (r.stdout + r.stderr).trim();
  return { ok: r.status === 0, feedback: out, codes: [...out.matchAll(/error (TS\d+)/g)].map((m) => m[1]) };
}

/** Runs one answer key against an app folder, end to end over HTTP, in a separate process. */
function e2e(dir: string, arm: Arm, tests: string): { ok: boolean; error?: string } {
  let runDir = dir;
  if (arm === 'tn') {
    const r = compile(read(join(dir, 'app.tn')), 'app.tn');
    if (!r.ok || !r.server || !r.client) return { ok: false, error: 'does not compile' };
    runDir = join(dir, 'built');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'server.ts'), r.server);
    writeFileSync(join(runDir, 'client.ts'), r.client);
  }
  const r = spawnSync('npx', ['tsx', join(ROOT, 'harness', 'boundary-e2e.ts'), runDir, tests], {
    cwd: ROOT, encoding: 'utf8', timeout: 60_000, env: { ...process.env, SIGNING_KEY: TEST_KEY },
  });
  const line = r.stdout?.split('\n').find((l) => l.startsWith('__RESULT__'));
  if (!line) return { ok: false, error: r.error ? `test rig: ${r.error.message}` : `crashed: ${(r.stderr ?? '').trim().split('\n').pop()}` };
  return JSON.parse(line.slice('__RESULT__'.length));
}

// ---- init

function brief(dir: string, meta: Meta, ticket: string, langPath: string): string {
  const submit = `npx tsx harness/boundary.ts submit ${dir}`;
  const intro = meta.arm === 'tn'
    ? `You are working on a small client/server shop app written in the Tensium language. The whole app, both halves, is in one file: \`${join(dir, 'app.tn')}\`.

Read the language reference first: \`${langPath}\``
    : `You are working on a small client/server shop app written in TypeScript, in \`${dir}\`:

- \`server.ts\` runs on the server.
- \`client.ts\` runs in the browser.${meta.arm === 'ts-shared' ? '\n- `types.ts` holds the types that both of them import.' : ''}

The client calls the server over HTTP: \`POST /rpc/<function name>\` with a JSON array of the arguments.`;
  const checker = meta.arm === 'tn' ? 'the Tensium compiler' : 'the TypeScript compiler (`tsc --strict`)';
  const keep = meta.arm === 'tn' ? '' : `
- Keep the wire format (\`POST /rpc/<function name>\`, JSON array of arguments) and do not rename or change the signature of \`serve\` in server.ts or \`connect\` in client.ts; the app is started and tested through them.`;
  return `# Task

${intro}

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
- Do NOT run any compiler, the app, or any tests yourself. The submit command above is your only feedback.${keep}
- Your final reply should be one line: whether your last submission was OK.
`;
}

function init(): void {
  const runId = opt('--run');
  if (!runId) throw new Error('--run ID is required');
  const arms = opt('--arms', ARMS.join(','))!.split(',') as Arm[];
  for (const a of arms) if (!ARMS.includes(a)) throw new Error(`unknown arm ${a}; use ${ARMS.join(', ')}`);
  const trials = Number(opt('--trials', '1'));
  const maxIter = Number(opt('--max-iter', '6'));
  const only = opt('--tasks')?.split(',');
  const tasks = taskIds().filter((t) => !only || only.includes(t));
  const runDir = join(RUNS, runId);
  mkdirSync(runDir, { recursive: true });
  const langPath = join(runDir, 'LANGUAGE.md');
  writeFileSync(langPath, languageReference('terse'));
  writeFileSync(join(runDir, 'NOTE.txt'), `boundary experiment; arms: ${arms.join(', ')}${opt('--note') ? `; ${opt('--note')}` : ''}\n`);
  const dirs: string[] = [];
  for (const task of tasks) for (const arm of arms) for (let trial = 1; trial <= trials; trial++) {
    const dir = join(runDir, `${task}__${arm}__t${trial}`);
    mkdirSync(dir, { recursive: true });
    const meta: Meta = { runId, task, arm, trial, maxIter };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
    for (const [name, text] of Object.entries(appFiles(arm, 'starter'))) writeFileSync(join(dir, name), text);
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
  mkdirSync(join(dir, snap), { recursive: true });
  for (const f of sourceFiles(dir)) cpSync(join(dir, f), join(dir, snap, f));
  const r = check(dir, meta.arm);
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
      const r = e2e(join(dir, last.dir), meta.arm, join(TASKS, meta.task, 'tests.ts'));
      row.correct = r.ok;
      row.testError = r.error;
    } else row.testError = last ? 'never passed its own compiler' : 'no submission';
    rows.push(row);
  }
  writeFileSync(join(runDir, 'results.json'), JSON.stringify(rows, null, 2));
  const arms = ARMS.filter((a) => rows.some((r) => r.arm === a));
  const tasks = [...new Set(rows.map((r) => r.task))];
  const cell = (rs: Row[]) => [f1(mean(rs.filter((r) => r.clean).map((r) => r.attempts))), `${rs.filter((r) => r.correct).length}/${rs.length}`];
  const note = existsSync(join(runDir, 'NOTE.txt')) ? read(join(runDir, 'NOTE.txt')).trim() : '';
  const head = ['task', ...arms.flatMap((a) => [`${a} iters`, `${a} correct`])];
  const out = [`# Results: ${runId}`, '', `Setup: ${note}`, '',
    `iters = mean submissions until the arm's own compiler reported OK (max ${maxIter}). correct = the hidden end-to-end tests pass.`, '',
    `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const t of tasks) out.push(`| ${t} | ${arms.flatMap((a) => cell(rows.filter((r) => r.task === t && r.arm === a))).join(' | ')} |`);
  out.push(`| **all tasks** | ${arms.flatMap((a) => cell(rows.filter((r) => r.arm === a)).map((c) => `**${c}**`)).join(' | ')} |`, '',
    '| arm | runs | compiler-clean | correct | clean but broken | first-try clean | mean iters (clean only) |', '|---|---|---|---|---|---|---|');
  for (const a of arms) {
    const rs = rows.filter((r) => r.arm === a);
    const clean = rs.filter((r) => r.clean);
    out.push(`| ${a} | ${rs.length} | ${clean.length} | ${rs.filter((r) => r.correct).length} | ${clean.filter((r) => !r.correct).length} | ${rs.filter((r) => r.firstTryClean).length} | ${f1(mean(clean.map((r) => r.attempts)))} |`);
  }
  const bad = rows.filter((r) => !r.correct);
  if (bad.length) out.push('', 'Runs that did not end correct:', ...bad.map((r) => `- ${r.task} [${r.arm} t${r.trial}] ${r.clean ? 'compiler-clean, but' : ''} ${r.testError}`.replace(/\s+/g, ' ')));
  const report = out.join('\n');
  writeFileSync(join(runDir, 'report.md'), report);
  console.log(report);
}

// ---- verify (no helpers): the starter passes the baseline, fails every task's tests, and each reference solution passes

function verify(): void {
  const scratch = join(RUNS, '_verify');
  let failures = 0;
  const place = (name: string, files: Files) => {
    const dir = join(scratch, name);
    mkdirSync(dir, { recursive: true });
    for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text);
    return dir;
  };
  const expect = (label: string, got: boolean, want: boolean, detail = '') => {
    const good = got === want;
    if (!good) failures++;
    console.log(`${good ? 'ok  ' : 'FAIL'} ${label}${good ? '' : `  (expected ${want ? 'pass' : 'fail'}) ${detail}`}`);
  };
  for (const arm of ARMS) {
    const starter = place(`starter__${arm}`, appFiles(arm, 'starter'));
    expect(`${arm}: starter passes its compiler`, check(starter, arm).ok, true);
    const base = e2e(starter, arm, join(B, 'baseline.tests.ts'));
    expect(`${arm}: starter passes the baseline tests`, base.ok, true, base.error);
    for (const task of taskIds()) {
      const tests = join(TASKS, task, 'tests.ts');
      expect(`${arm}: starter does NOT already pass ${task}`, e2e(starter, arm, tests).ok, false);
      const sol = place(`${task}__${arm}`, appFiles(arm, task));
      const c = check(sol, arm);
      expect(`${arm}: ${task} solution passes its compiler`, c.ok, true, c.feedback.slice(0, 300));
      const r = e2e(sol, arm, tests);
      expect(`${arm}: ${task} solution passes the hidden tests`, r.ok, true, r.error);
    }
  }
  console.log(failures ? `\n${failures} problem(s)` : '\nall good');
  process.exit(failures ? 1 : 0);
}

// ---- drift (no helpers): plant a mistake that touches only one side, and see who notices

function drift(): void {
  const scratch = join(RUNS, '_drift');
  const swap = (text: string, old: string, neu: string, times = 1): string => {
    if (text.split(old).length - 1 !== times) throw new Error(`expected ${times} of: ${old}`);
    return text.split(old).join(neu);
  };
  const tsMix = (arm: Arm, server: 'starter' | string, client: 'starter' | string): Files => {
    // the server half (and, when shared, the types file) comes from one version of the app and the client half from another
    if (arm === 'ts-split') return { 'server.ts': appFiles(arm, server)['server.ts'], 'client.ts': appFiles(arm, client)['client.ts'] };
    const s = appFiles('ts-shared', server);
    return { 'types.ts': s['types.ts'], 'server.ts': s['server.ts'], 'client.ts': appFiles('ts-shared', client)['client.ts'] };
  };
  const tsEdit = (arm: Arm, from: 'starter' | string, edit: (client: string) => string): Files => {
    const f = appFiles(arm, from);
    return { ...f, 'client.ts': edit(f['client.ts']) };
  };
  const starterTn = appFiles('tn', 'starter')['app.tn'];
  const couponTn = appFiles('tn', '05-coupon')['app.tn'];
  const [couponServer, couponClient] = couponTn.split('// ---- client');
  const wrongOrder = (t: string) => swap(swap(t, 'getQuote(productId, quantity, coupon, customerId)', 'getQuote(productId, quantity, customerId, coupon)'),
    'checkout(productId, quantity, coupon, customerId)', 'checkout(productId, quantity, customerId, coupon)');
  const cases: { name: string; task: string; files: (arm: Arm) => Files }[] = [
    {
      name: 'server renames Customer.name to fullName; client not updated', task: '01-rename-field',
      files: (arm) => arm === 'tn'
        ? { 'app.tn': ['Ann Lee', 'Bo Chen', 'Cy Young'].reduce((t, n) => swap(t, `name: "${n}"`, `fullName: "${n}"`),
            swap(starterTn, 'type Customer = { id: number, name: string,', 'type Customer = { id: number, fullName: string,')) }
        : tsMix(arm, '01-rename-field', 'starter'),
    },
    {
      name: 'server takes the coupon after quantity; client sends it last', task: '05-coupon',
      files: (arm) => arm === 'tn'
        ? { 'app.tn': couponServer + '// ---- client' + wrongOrder(couponClient) }
        : tsEdit(arm, '05-coupon', (c) => swap(c, '[productId, quantity, coupon, customerId]', '[productId, quantity, customerId, coupon]', 2)),
    },
    {
      name: 'client checks the receipt itself, using the signing key', task: '07-verify-receipt',
      files: (arm) => arm === 'tn'
        ? { 'app.tn': starterTn + `
client fn receiptIsValid(productId: number, quantity: number, customerId: number, signature: string): boolean {
  match getQuote(productId, quantity, customerId) {
    ok(q) => { return sign(secret("SIGNING_KEY"), str(customerId) + ":" + str(q.product.id) + ":" + str(q.totalCents)) == signature; }
    err(e) => { return false; }
  }
}
` }
        : tsEdit(arm, 'starter', (c) => swap(c, "\n\nlet endpoint", "\nimport { createHmac } from 'node:crypto';\n\nlet endpoint") + `
export async function receiptIsValid(productId: number, quantity: number, customerId: number, signature: string): Promise<boolean> {
  const r = await rpc<Quote>('getQuote', [productId, quantity, customerId]);
  if (!r.ok) return false;
  const key = process.env.SIGNING_KEY ?? '';
  return createHmac('sha256', key).update(\`\${customerId}:\${r.value.product.id}:\${r.value.totalCents}\`).digest('hex').slice(0, 16) === signature;
}
`),
    },
  ];
  const lines = ['| planted mistake | arm | its compiler says | hidden end-to-end tests |', '|---|---|---|---|'];
  for (const [i, c] of cases.entries()) for (const arm of ARMS) {
    const dir = join(scratch, `m${i + 1}__${arm}`);
    mkdirSync(dir, { recursive: true });
    for (const [f, text] of Object.entries(c.files(arm))) writeFileSync(join(dir, f), text);
    const r = check(dir, arm);
    const verdict = r.ok ? 'OK (not noticed)' : `rejected: ${[...new Set(r.codes)].join(', ')}`;
    const tests = r.ok ? e2e(dir, arm, join(TASKS, c.task, 'tests.ts')) : null;
    lines.push(`| ${c.name} | ${arm} | ${verdict} | ${tests === null ? 'never ships' : tests.ok ? 'pass' : `FAIL: ${tests.error}`} |`);
  }
  const report = lines.join('\n');
  mkdirSync(scratch, { recursive: true });
  writeFileSync(join(scratch, 'report.md'), report);
  console.log(report);
}

const cmd = argv[0];
if (cmd === 'init') init();
else if (cmd === 'submit') submit();
else if (cmd === 'score') score();
else if (cmd === 'verify') verify();
else if (cmd === 'drift') drift();
else { console.error('usage: init --run ID | submit <workdir> | score <run ID> | verify | drift'); process.exit(2); }
