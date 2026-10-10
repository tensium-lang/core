// This file is the test rig for one finished invoicing app in Experiment 5. It starts the app's
// real server, points the app's client at it, runs one secret answer key against the pair, and
// prints whether everything matched. It knows how to start all three kinds of app: TypeScript
// (imports the server and client modules), Tensium (imports the TypeScript the compiler wrote)
// and Rust (runs the two built programs). It runs as its own process so one broken app cannot
// upset the next.
//
//   tsx harness/conventions-e2e.ts <ts|tn|rs> <app dir> <tests.ts>

import { spawn, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [arm, dirArg, testsArg] = process.argv.slice(2);
const dir = resolve(dirArg);
const key = process.env.WEBHOOK_SECRET ?? '';
const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0];

/** Every source file under a folder, joined, so an answer key can scan what would be shipped. */
function sourcesUnder(root: string, exts: string[]): string {
  if (!existsSync(root)) return '';
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (f.startsWith('attempt-') || f === 'target' || f === 'node_modules') continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (exts.some((x) => f.endsWith(x))) out.push(readFileSync(p, 'utf8'));
    }
  };
  walk(root);
  return out.join('\n');
}

interface Running { url: string; close: () => Promise<void> }
type Client = Record<string, (...args: unknown[]) => Promise<unknown>>;

async function startTs(): Promise<{ running: Running; client: Client; clientSource: string }> {
  const server = await import(pathToFileURL(join(dir, 'server', 'index.ts')).href);
  const client = await import(pathToFileURL(join(dir, 'client', 'index.ts')).href);
  const running = await server.serve(0);
  client.connect(running.url);
  return { running, client, clientSource: sourcesUnder(join(dir, 'client'), ['.ts']) + '\n' + sourcesUnder(join(dir, 'shared'), ['.ts']) };
}

/** A compiled Tensium app: the harness has already written out/server.ts and out/client.ts next to app.tn. */
async function startTn(): Promise<{ running: Running; client: Client; clientSource: string }> {
  const server = await import(pathToFileURL(join(dir, 'out', 'server.ts')).href);
  const client = await import(pathToFileURL(join(dir, 'out', 'client.ts')).href);
  const running = await server.__serve(0);
  client.__connect(running.url);
  return { running, client, clientSource: readFileSync(join(dir, 'out', 'client.ts'), 'utf8') };
}

/** A Rust app: the harness has copied the built programs to bin/server and bin/client. */
async function startRs(): Promise<{ running: Running; client: Client; clientSource: string }> {
  const proc = spawn(join(dir, 'bin', 'server'), ['0'], { env: { ...process.env, WEBHOOK_SECRET: key }, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise<string>((res, rej) => {
    let out = '';
    let errText = '';
    proc.stdout.on('data', (c) => { out += c; const m = /LISTENING (\S+)/.exec(out); if (m) res(m[1]); });
    proc.stderr.on('data', (c) => { errText += c; });
    proc.on('exit', (code) => rej(new Error(`server exited with ${code}: ${errText.split('\n')[0]}`)));
    setTimeout(() => rej(new Error('server did not start in time')), 15000);
  });
  const running: Running = { url, close: () => new Promise((res) => { proc.on('exit', () => res()); proc.kill(); }) };
  const client: Client = new Proxy({}, {
    get: (_t, name: string) => async (...args: unknown[]) => {
      const r = spawnSync(join(dir, 'bin', 'client'), [url, name, JSON.stringify(args)], { encoding: 'utf8', timeout: 20000 });
      if (r.status !== 0) throw new Error(`client ${name} failed: ${(r.stderr || r.stdout).split('\n')[0]}`);
      return JSON.parse(r.stdout);
    },
  });
  return { running, client, clientSource: sourcesUnder(join(dir, 'client'), ['.rs']) + '\n' + sourcesUnder(join(dir, 'shared'), ['.rs']) };
}

let result: { ok: boolean; error?: string };
try {
  const { running, client, clientSource } = await (arm === 'ts' ? startTs() : arm === 'tn' ? startTn() : startRs());
  const ctx = {
    key,
    rpc: async (name: string, args: unknown[]) => (await fetch(`${running.url}/rpc/${name}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args),
    })).json(),
    signature: (message: string) => createHmac('sha256', key).update(message).digest('hex').slice(0, 16),
    clientSource,
  };
  try {
    await (await import(pathToFileURL(resolve(testsArg)).href)).default(client, ctx);
    result = { ok: true };
  } catch (e) {
    result = { ok: false, error: firstLine(e) };
  }
  await running.close();
} catch (e) {
  result = { ok: false, error: 'could not start the app: ' + firstLine(e) };
}
console.log('\n__RESULT__' + JSON.stringify(result));
process.exit(0);
