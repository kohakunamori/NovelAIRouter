# Backend Architecture

## Purpose

This backend is a managed NovelAI image relay service.

It does not expose a raw open proxy. Client requests are authenticated, normalized, checked by policy, billed in platform units, and then executed through a managed NovelAI account pool.

## Package boundaries

### `apps/api`

Owns:

- Fastify HTTP app
- auth and session handling
- admin routes
- generation routes
- queue worker
- Prisma access
- Redis lease and queue state
- file persistence
- NovelAI provider implementations

Key entry points:

- `apps/api/src/main.ts`
- `apps/api/src/app.ts`
- `apps/api/src/generations/generationWorker.ts`

### `packages/shared`

Owns:

- zod request and response schemas
- generation parameter normalization contracts
- policy schemas
- event schemas
- account test and admin payload schemas
- API-facing shared types

This package is required at runtime and compile time when migrating the backend.

## Runtime model

The current API process starts both:

- the Fastify HTTP server
- the BullMQ generation worker

This means one process is enough for local development and small deployments.

If you later split processes, keep the same queue, Redis, Prisma schema, and provider code.

## Core modules

### Auth

Files:

- `apps/api/src/auth/auth.routes.ts`
- `apps/api/src/auth/session.ts`
- `apps/api/src/auth/guards.ts`
- `apps/api/src/auth/password.ts`

Behavior:

- register/login/logout/me endpoints
- cookie-based session token
- route guards for authenticated and admin-only access

### Generation submission

Files:

- `apps/api/src/generations/generation.routes.ts`
- `packages/shared/src/generation.ts`

Behavior:

- accepts internal generation requests and managed official-style NovelAI payloads
- supports JSON and multipart requests
- hydrates uploaded files into request parameters
- verifies asset ownership
- applies parameter policies before queueing
- writes generation jobs to PostgreSQL
- stores transient file references for worker pickup

### Queue worker

Files:

- `apps/api/src/generations/generationQueue.ts`
- `apps/api/src/generations/generationWorker.ts`
- `apps/api/src/generations/eventBus.ts`

Behavior:

- reads queued jobs from BullMQ
- loads normalized params and transient references
- acquires a NovelAI account lease when needed
- calls the selected provider
- emits progress and terminal events
- persists generated outputs
- records billing after completion

### NovelAI provider layer

Files:

- `apps/api/src/novelai/providerFactory.ts`
- `apps/api/src/novelai/NovelAiProvider.ts`
- `apps/api/src/novelai/mockNovelAiProvider.ts`
- `apps/api/src/novelai/realNovelAiProvider.ts`

Behavior:

- mock provider for local development without real upstream usage
- real provider for managed upstream requests
- support for generate-image-stream, suggest-tags, and dedicated x4 upscale
- optional health-check and smoke-test account flows

### Account pool

Files:

- `apps/api/src/novelai/accountPool.ts`
- `apps/api/src/novelai/credentials.ts`
- `apps/api/src/novelai/readiness.ts`

Behavior:

- encrypted credential storage in PostgreSQL
- Redis-based lease ownership
- account cooldown and error marking
- readiness checks before real generation

### Billing

Files:

- `apps/api/src/billing/billing.ts`
- `packages/shared/src/anlasEstimator.ts`

Behavior:

- estimate NovelAI Anlas at submit time
- persist platform multiplier snapshot on job creation
- compute billed platform units after actual completion
- write ledger entries for grants and generation debits

### Policy engine

Files:

- `apps/api/src/policies/policyEngine.ts`
- `apps/api/src/policies/policyStore.ts`

Behavior:

- loads global, role, and user-scoped policies
- applies defaults, clamps, force rules, allow/deny, and rejection
- stores decision metadata with generation jobs

### Asset and file persistence

Files:

- `apps/api/src/assets.routes.ts`
- `apps/api/src/assetsService.ts`
- `apps/api/src/storage/index.ts`
- `apps/api/src/storage/diskStorage.ts`

Behavior:

- accepts reference image uploads
- persists metadata in PostgreSQL
- stores binary content on disk or mounted storage
- persists generated images as assets plus output records

## Persistence layout

### PostgreSQL

Main tables:

- `User`
- `Session`
- `PlatformSettings`
- `ParameterPolicy`
- `NovelAiAccount`
- `GenerationJob`
- `Asset`
- `GenerationOutput`
- `LedgerEntry`

Schema source:

- `apps/api/prisma/schema.prisma`

### Redis

Used for:

- BullMQ job queue
- account-lease ownership and TTL state
- transient generation reference payloads

### Filesystem

Used for:

- uploaded reference images
- generated image binaries

Default root is `apps/api/.data/storage` when `STORAGE_ROOT` is relative.

## Generation lifecycle

1. client sends `POST /api/generations`
2. backend authenticates user
3. backend parses internal or managed official-style payload
4. backend applies policies and estimates cost
5. backend creates `GenerationJob`
6. backend stores transient file references if needed
7. backend queues the job in BullMQ
8. worker acquires a NovelAI account lease when required
9. provider executes upstream request
10. worker persists outputs and computes actual billing
11. client follows progress through SSE and downloads result assets

## Current official-style request coverage

Supported:

- `generate`
- `img2img` variations
- `img2img` enhance
- `img2img` x4 upscale only
- `GET /api/novelai/suggest-tags`

Not supported:

- arbitrary or unknown official request shapes
- full upstream path mirroring
- non-image NovelAI product areas

## Current deployment assumptions

- one API process can run both HTTP and worker locally
- PostgreSQL and Redis must be reachable at startup
- real provider requires at least one active account and a credential encryption key
- CORS is frontend-oriented and controlled by `WEB_ORIGIN`
