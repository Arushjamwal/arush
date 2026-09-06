# Growth Studio — shared version (Cloudflare Pages)

This is the same tool, set up so you AND your client see the same data — both of
you hit a real shared cloud store (Cloudflare Workers KV), not your own browser.
That's the one big difference from the earlier Vercel version, which only saved
data locally per-browser.

Three moving pieces, all inside one free Cloudflare account:

1. **Cloudflare Pages** — hosts the website itself, free, unlimited static requests.
2. **Pages Functions** (`/functions/api/*`) — small server-side files that run on
   Cloudflare's servers. `vision.js` and `trends.js` call Anthropic on your behalf
   (keeping your API key hidden from the browser); `data.js` reads and writes the
   shared data.
3. **Workers KV** — the actual shared storage. One namespace, read and written by
   anyone who opens the site.

## Before you deploy

1. Get an Anthropic API key at https://console.anthropic.com (separate login from
   claude.ai — new accounts get a small free trial credit automatically). After
   that, usage is billed pay-per-use — check current pricing at docs.claude.com.
2. Open `functions/api/vision.js` and `functions/api/trends.js` and check the
   `MODEL` constant against https://docs.claude.com/en/docs/about-claude/models —
   model names change, and the one in this file may be out of date.

## Deploy to Cloudflare Pages

1. Create a free account at https://dash.cloudflare.com if you don't have one.
2. Push this folder to a new GitHub repository.
3. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**,
   and pick that repository.
4. Build settings: framework preset **Vite**, build command `npm run build`,
   build output directory `dist`. Leave everything else default.
5. Before the first deploy (or right after, then redeploy), go to your new
   project's **Settings → Environment variables** and add:
   - Name: `ANTHROPIC_API_KEY`, Value: your real key.
   Add it for both **Production** and **Preview**.
6. Create the shared storage: **Workers & Pages → KV → Create a namespace**
   (call it anything, e.g. `growth-kv`).
7. Bind it to this project: your Pages project → **Settings → Functions → KV
   namespace bindings → Add binding**:
   - Variable name: `GROWTH_KV` (must match exactly — that's what `data.js` looks for)
   - KV namespace: the one you just created.
   Add this binding for both Production and Preview too.
8. Trigger a deploy (push any small change, or use "Retry deployment" in the
   dashboard) so the environment variable and the KV binding actually take effect —
   they don't apply retroactively to a deploy that already finished.
9. You'll get a `*.pages.dev` address. That's the real, live, shared link —
   send it to your client the same way you'd send any website link.

## Using it with your client

Send them the `*.pages.dev` link (or a custom domain, if you add one later in
Pages → Custom domains — also free). Whoever opens it — you or them — reads and
writes the same growth log, reel log, and screenshots. No separate logins, no
separate histories.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # paste your real key in
npx wrangler pages dev -- npm run dev
```

Plain `npm run dev` (Vite alone) won't run the `/api` functions or KV — use the
`wrangler pages dev` command above for a local test that includes them.
