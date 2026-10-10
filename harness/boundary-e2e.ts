// This file is the test rig for one finished two-sided app. It starts the app's real server,
// points the app's client at it, runs one secret answer key against the pair, and prints
// whether everything matched. It runs as its own process so one broken app cannot upset the next.
//
//   tsx harness/boundary-e2e.ts <dir with server.ts and client.ts> <tests.ts>

import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [dirArg, testsArg] = process.argv.slice(2);
const dir = resolve(dirArg);
const key = process.env.SIGNING_KEY ?? '';
const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0];

let result: { ok: boolean; error?: string };
try {
  const server = await import(pathToFileURL(join(dir, 'server.ts')).href);
  const client = await import(pathToFileURL(join(dir, 'client.ts')).href);
  // compiled Tensium exports __serve/__connect; the hand-written TypeScript apps export serve/connect
  const running = await (server.__serve ?? server.serve)(0);
  (client.__connect ?? client.connect)(running.url);
  const ctx = {
    key,
    rpc: async (name: string, args: unknown[]) => (await fetch(`${running.url}/rpc/${name}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args),
    })).json(),
    signature: (message: string) => createHmac('sha256', key).update(message).digest('hex').slice(0, 16),
    // everything except the server file would be shipped to the client
    clientSource: readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'server.ts').map((f) => readFileSync(join(dir, f), 'utf8')).join('\n'),
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
