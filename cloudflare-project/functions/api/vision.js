// Cloudflare Pages Function — POST /api/vision
// Keeps the Anthropic API key on the server: the browser calls THIS endpoint, never
// Anthropic directly. Set ANTHROPIC_API_KEY under your Pages project's
// Settings > Environment variables (do this for both Production and Preview).

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
  const { mediaType, base64, prompt } = body || {};
  if (!base64 || !prompt) return json({ error: 'Missing image or prompt' }, 400);
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
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    const data = await resp.json();
    return json(data, resp.status);
  } catch (e) {
    return json({ error: e.message || 'Server error calling Anthropic' }, 500);
  }
}
