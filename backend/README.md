# Standalone NovelAI Router Backend

This directory is a copyable standalone repository skeleton for the current managed NovelAI backend.

## Included

- `apps/api` — Fastify API, worker, Prisma, provider integration
- `packages/shared` — shared zod schemas and API contracts required by the backend
- `docs/` — architecture, API reference, and migration notes
- `.env.example` — root env template for Prisma and runtime commands
- `docker-compose.yml` — local PostgreSQL and Redis

## Use this as a new repository

1. Copy the whole `standalone-backend` directory out to a new location.
2. Initialize a new git repository there.
3. Copy `.env.example` to `.env` or point `API_ENV_FILE` at your real env file.
4. Run:

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Important boundary

This is a managed NovelAI image relay backend, not a full mirror of every official NovelAI endpoint.

Currently supported official-style request modes:

- `generate`
- `img2img` variations
- `img2img` enhance
- `x4 upscale`
- `suggest-tags`

## Main docs

- `apps/api/README.md`
- `docs/backend-architecture.md`
- `docs/backend-api-reference.md`
- `docs/backend-migration-guide.md`
