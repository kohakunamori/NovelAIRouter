# NovelAI Router Backend

This package is the managed backend for NovelAI image generation relay flows.

## What this backend does

- user registration, login, logout, and session-based auth
- managed generation submission and queue execution
- NovelAI account-pool leasing for upstream requests
- policy enforcement before generation
- platform-unit billing derived from NovelAI Anlas
- generated asset persistence and download
- generation SSE event streaming
- admin APIs for settings, policies, ledger grants, and NovelAI account management

## What you need to migrate with it

This backend is not fully standalone by itself.

You should migrate these parts together:

1. `apps/api`
2. `packages/shared`
3. `apps/api/prisma`
4. any existing docs you still want from `docs/`

`packages/shared` contains the runtime schemas and shared API contracts used by the backend.

## Runtime dependencies

- PostgreSQL
- Redis
- local or mounted filesystem storage
- optional outbound proxy for real NovelAI requests
- at least one active NovelAI credential in the account pool for upstream execution

## Quick start

1. Copy `.env.example` to `.env`
2. Install dependencies
3. Generate Prisma client
4. Run migrations
5. Seed defaults
6. Start the API

Example:

```bash
pnpm install
pnpm --filter @novelai-router/api db:generate
pnpm --filter @novelai-router/api db:migrate
pnpm --filter @novelai-router/api db:seed
pnpm --filter @novelai-router/shared build
pnpm --filter @novelai-router/api dev
```

## Docs

- `../../docs/backend-architecture.md` — module boundaries, data flow, persistence, worker model
- `../../docs/backend-api-reference.md` — route list, auth rules, generation lifecycle, SSE events
- `../../docs/backend-migration-guide.md` — step-by-step migration checklist for another project

## Current product boundary

This backend is a managed image-generation relay, not a full drop-in mirror of all NovelAI official endpoints.

Currently supported official-style request modes are:

- `generate`
- `img2img` variations
- `img2img` enhance
- `x4 upscale`
- `suggest-tags`

Unknown or unverified official-style request shapes are rejected.
