// Cloudflare Pages Function — POST /api/trends
// Keeps the Anthropic API key on the server. Set ANTHROPIC_API_KEY under your Pages
// project's Settings > Environment variables (Production and Preview both).

import { json } from '../_utils.js';

// IMPORTANT: check https://docs.claude.com/en/docs/about-claude/models for the current
// model name and update this — model names change over time.
const MODEL = 'claude-sonnet-4-5-20250929'; // <-- verify/update this against Anthropic's docs

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const { prompt } = body || {};
  if (!prompt) return json({ error: 'Missing prompt' }, 400);
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY is not set on the server' }, 500);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
        // Web search adds a small per-search fee on top of normal token pricing —
        // see https://docs.claude.com for current rates.
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
    });
    const data = await resp.json();
    return json(data, resp.status);
  } catch (e) {
    return json({ error: e.message || 'Server error calling Anthropic' }, 500);
  }
}
