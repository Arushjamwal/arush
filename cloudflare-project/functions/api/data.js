// Cloudflare Pages Function — GET/POST /api/data
// This is what makes the data SHARED: it reads and writes a Workers KV namespace,
// not the visitor's own browser. Whoever opens the site — you or your client —
// hits the same KV store, so you both see the same growth log and reel log.
//
// Setup required in the Cloudflare dashboard:
//   1. Workers & Pages > KV > Create a namespace (call it anything, e.g. GROWTH_KV).
//   2. Your Pages project > Settings > Functions > KV namespace bindings > Add binding:
//        Variable name: GROWTH_KV   ->   the namespace you just created.
//      Do this for both Production and Preview.

import { json } from '../_utils.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return json({ error: 'Missing key' }, 400);
  if (!env.GROWTH_KV) return json({ error: 'GROWTH_KV namespace is not bound on the server' }, 500);
  const value = await env.GROWTH_KV.get(key);
  return json({ value });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const { key, value } = body || {};
  if (!key) return json({ error: 'Missing key' }, 400);
  if (!env.GROWTH_KV) return json({ error: 'GROWTH_KV namespace is not bound on the server' }, 500);
  await env.GROWTH_KV.put(key, value ?? '');
  return json({ ok: true });
}
