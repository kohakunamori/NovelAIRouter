# Backend Migration Guide

## Goal

Use this guide when moving the current backend into another project while keeping its managed NovelAI relay behavior intact.

## What to move

Move these directories together:

```text
apps/api
packages/shared
```

Also keep:

```text
apps/api/prisma
```

If you only move `apps/api` and leave `packages/shared` behind, the backend will not build because request and response contracts live in the shared package.

## Minimal migration plan

1. copy `apps/api`
2. copy `packages/shared`
3. install the combined dependency tree
4. set up PostgreSQL and Redis
5. copy or recreate environment variables from `apps/api/.env.example`
6. run Prisma generate and migrations
7. seed the database if you want the default admin and default policy
8. build `packages/shared`
9. start the API
10. configure at least one active NovelAI account before enabling upstream execution

## Migration boundaries

### Safe to treat as backend-only

- Fastify routes under `apps/api/src`
- Prisma schema and migrations
- queue worker
- account pool and provider logic
- billing, policies, assets, sessions

### Must move with backend

- `packages/shared`
  - zod schemas
  - shared contracts
  - generation and policy types
  - SSE event schemas

### Optional to keep or rewrite

- current frontend in `apps/web`
- old frontend integration notes in `docs/`
- root workspace scripts

## Portability fixes already applied

To make migration easier, this backend now:

- resolves relative storage paths from `apps/api` instead of the caller's working directory
- looks for `.env` from the current working directory first and supports `API_ENV_FILE` override
- no longer depends on the repository root `tsconfig.base.json` in `apps/api` and `packages/shared`

## New project structure recommendation

Recommended target layout:

```text
your-project/
├─ apps/
│  └─ api/
├─ packages/
│  └─ shared/
├─ package.json
└─ pnpm-workspace.yaml
```

If you do not want a monorepo, you have two realistic options:

1. publish `packages/shared` as an internal package and install it normally
2. merge `packages/shared/src` into the backend codebase and rewrite imports

The first option is lower risk.

## Environment checklist

### Required infrastructure

- `DATABASE_URL`
- `REDIS_URL`

### Required for real upstream execution

- at least one active NovelAI account in the database
- reachable `NOVELAI_GENERATE_URL`
- configure proxy and health-check settings from the admin console when needed

### Optional bootstrap helpers

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

These are read by `prisma/seed.ts` to create or promote a bootstrap admin.

## Database migration steps

Run in order:

```bash
pnpm --filter @novelai-router/api db:generate
pnpm --filter @novelai-router/api db:migrate
pnpm --filter @novelai-router/api db:seed
```

What seed currently does:

- ensures default platform settings exist
- optionally creates or promotes the bootstrap admin from env vars
- ensures one default global policy exists

## Runtime bring-up sequence

For a clean environment:

1. start PostgreSQL
2. start Redis
3. apply migrations
4. seed defaults
5. build `packages/shared`
6. start API
7. verify `/api/health`
8. log in as admin
9. configure at least one active NovelAI account
10. run account `health_check`, then optional `smoke_test`
11. submit a real generation job

## Integration points you may need to adapt

### 1. Auth model

Current auth is browser-oriented cookie session auth.

If the destination project needs API keys, JWT, SSO, or upstream user federation, you will need to replace:

- `apps/api/src/auth/session.ts`
- `apps/api/src/auth/guards.ts`
- parts of `apps/api/src/auth/auth.routes.ts`

### 2. Balance model

Current generation admission checks only require a positive balance before queueing.
Actual billed units are written after the provider finishes.

If the destination project needs strict reservation or pre-authorization, extend:

- `apps/api/src/generations/generation.routes.ts`
- `apps/api/src/billing/billing.ts`

### 3. Storage adapter

Current binary persistence uses local disk storage.

If the destination project uses S3, R2, or another blob store, replace:

- `apps/api/src/storage/adapter.ts`
- `apps/api/src/storage/diskStorage.ts`
- `apps/api/src/storage/index.ts`

### 4. Worker topology

Current `src/main.ts` runs HTTP and worker in one process.

If the destination project needs separate API and worker processes, keep the worker code and split the bootstrap.
The main logic already lives in:

- `apps/api/src/generations/generationWorker.ts`

### 5. Frontend origin and session cookie rules

If the destination project changes its frontend domain, update:

- `WEB_ORIGIN`
- any production cookie settings you want to harden in session handling

### 6. Official request compatibility boundary

The backend is intentionally strict.

It does not accept arbitrary NovelAI payloads. It only accepts verified managed shapes.
If the destination project wants broader compatibility, extend the schemas and conversion logic in:

- `packages/shared/src/generation.ts`
- `apps/api/src/generations/generation.routes.ts`

## Smoke-test checklist after migration

- `GET /api/health` returns `{ ok: true }`
- register and login work
- admin seed account exists when env vars were provided
- asset upload works
- `POST /api/generations` creates a job in mock mode
- SSE stream emits `queued`, `running`, and terminal events
- result download works
- admin overview loads
- policy preview works
- NovelAI account create and rotate endpoints work
- real provider account test succeeds when enabled

## Recommended first follow-up tasks in the new project

1. decide whether auth remains cookie-based
2. decide whether billing should reserve balance before queueing
3. choose permanent blob storage
4. decide whether worker and API remain in one process
5. decide whether to keep `packages/shared` as a sibling package or publish it internally

## Known current limitations to keep in mind

- not a full mirror of all official NovelAI endpoints
- no public generation cancel route yet
- no non-image NovelAI product coverage
- readiness for real generation depends on active account pool state and environment configuration
