// How the client talks to the server: connect(url) says where the server is, and rpc(name, args)
// sends one request ("POST /rpc/<name>" with the arguments as a JSON array) and gives back the
// server's Result. If the network fails, that failure comes back as an err too.

import type { Result } from '../shared/types.ts';

let endpoint = 'http://127.0.0.1:8787';

/** Tells the client where the server is. */
export function connect(url: string): void {
  endpoint = url.replace(/\/$/, '');
}

export async function rpc<T>(name: string, args: unknown[]): Promise<Result<T, string>> {
  try {
    const res = await fetch(`${endpoint}/rpc/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) return { ok: false, error: `network: HTTP ${res.status}` };
    return (await res.json()) as Result<T, string>;
  } catch (e) {
    return { ok: false, error: 'network: ' + (e instanceof Error ? e.message : String(e)) };
  }
}
