# Kino — Seedance 2.5 Prompt Studio

An elegant, responsive prompt builder powered by an OpenAI-compatible Kimi-k3 endpoint. Built with Next.js, React, native canvas, and native `fetch`. No database, OpenAI SDK, or animation dependency.

## Run locally

```bash
npm install
cp .env.example .env.local
# Fill in OPENAI_API_KEY and OPENAI_BASE_URL
npm run dev
```

Open `http://localhost:3000`. Local development bypasses Turnstile and rate limiting so you can test without public protection services. Never use this bypass for an internet-facing deployment.

## Environment

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server-only OpenAI-compatible API key |
| `OPENAI_BASE_URL` | Provider base URL ending in `/v1`, without `/chat/completions` |
| `OPENAI_MODEL` | Defaults to `kimi-k3` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile server secret |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public Cloudflare Turnstile site key |

Copy `.env.example` to `.env.local`; real secrets must never be committed. `.gitignore` excludes both environment files.

## Deploy to Vercel

Push these files to a GitHub repository, import the repository at https://vercel.com/new, and keep the detected Next.js settings. Add all seven environment variables for Production. Create a free Upstash Redis database and a Cloudflare Turnstile widget, then add your production hostname to the widget's allowed hostnames.

Production deliberately fails closed if Redis or Turnstile is missing or unavailable. The limit is 10 prompt requests per forwarded IP per hour. Also configure a hard spending limit and usage alerts at your model provider; CAPTCHA and rate limiting cannot eliminate deliberate paid-key consumption.

## Checks

```bash
npm test
npm run build
```

Tests cover validation, fixed duration/resolution choices, custom controls, provider response handling, unsafe model responses, missing credentials, request limits, Turnstile, and Redis failure behavior. A real provider test still requires valid credentials.

## Privacy and scope

The server sends the submitted creative direction to your model provider. Prompts and generated results are not stored by this app. Redis stores a short-lived rate-limit counter keyed by IP. No accounts, history, uploads, streaming, or video generation are included.
