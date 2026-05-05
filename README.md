# NovelAI Image Site Upload Package

This folder is a cleaned upload-ready package extracted from the current project. It separates the Next.js frontend and the standalone NovelAI router backend so they can be uploaded together or moved into separate repositories.

## Screenshots

### Frontend workspace

![Frontend workspace](docs/screenshots/frontend-workspace.png)

### Backend admin console

![Backend admin console](docs/screenshots/backend-admin-console.png)

### Backend API overview

![Backend API overview](docs/screenshots/backend-api-overview.png)

## Package layout

```text
upload-package/
├── frontend/                 # Next.js 16 + React 19 frontend
│   ├── src/                  # App routes, UI components, hooks, and frontend API proxy routes
│   ├── public/               # Fonts, SEO assets, and quickstart gallery assets
│   ├── package.json          # npm scripts and frontend dependencies
│   ├── package-lock.json     # npm lockfile
│   ├── .env.example          # Frontend runtime env template
│   ├── Dockerfile            # Production frontend container
│   ├── Dockerfile.dev        # Development frontend container
│   └── docker-compose.yml    # Frontend Docker Compose examples
├── backend/                  # Standalone NovelAI router backend workspace
│   ├── apps/api/             # Fastify API, Prisma schema, routes, worker, and scripts
│   ├── packages/shared/      # Shared API contracts and runtime schemas
│   ├── docs/                 # Backend architecture, API reference, and migration notes
│   ├── package.json          # pnpm workspace scripts
│   ├── pnpm-lock.yaml        # pnpm lockfile
│   ├── pnpm-workspace.yaml   # pnpm workspace definition
│   ├── .env.example          # Backend root env template
│   └── docker-compose.yml    # PostgreSQL and Redis services for local development
├── docs/screenshots/         # README screenshots
└── .gitignore                # Upload-package safety ignores
```

## What was intentionally excluded

The package excludes local or generated files that should not be uploaded:

- dependency folders: `node_modules/`
- frontend build outputs: `.next/`, `out/`
- backend build outputs: `dist/`
- backend runtime storage: `.data/`
- real environment files: `.env`, `.env.local`, `.env.*.local`
- logs, TypeScript build info, local cache folders, and machine-specific files

Only checked-in source, configuration, lockfiles, example env files, docs, and screenshots were copied.

## Requirements

### Shared

- Node.js 24 or newer
- Git, if you plan to upload this as one or two repositories

### Frontend

- npm, using the included `package-lock.json`
- Default dev URL: `http://localhost:3000`

### Backend

- pnpm 10.x, using the included `pnpm-lock.yaml`
- PostgreSQL
- Redis
- Local or mounted filesystem storage for generated assets
- At least one valid NovelAI credential configured in the backend account pool before real upstream generation works

## How the frontend and backend connect

The frontend contains Next.js API proxy routes under `frontend/src/app/api/**`. Those routes forward managed auth, admin, user-settings, generation, and NovelAI requests to the backend origin configured by:

```bash
NOVELAI_ROUTER_ORIGIN=http://127.0.0.1:4000
```

The backend example env uses:

```bash
API_HOST=0.0.0.0
API_PORT=4000
WEB_ORIGIN=http://localhost:3000
```

Keep `frontend/.env.local` and `backend/.env` aligned. If the backend runs on a different host or port, update `NOVELAI_ROUTER_ORIGIN` in the frontend.

## Frontend setup

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

### Frontend commands

```bash
npm run dev        # Start the Next.js development server
npm run build      # Build for production
npm run start      # Start the production server after build
npm run lint       # Run ESLint
npm run typecheck  # Run TypeScript without emitting files
npm run check      # Run lint, typecheck, and build
```

### Frontend Docker option

```bash
cd frontend
docker compose up dev --build
```

The dev service maps to `http://localhost:3001` by default. The production service maps to `http://localhost:3000` by default.

## Full-stack Docker image

The root `Dockerfile` builds a single-container image that starts PostgreSQL, Redis, the backend API, and the Next.js frontend together. Runtime data is stored under `/data`, so mount that path when deploying.

```bash
docker run -d \
  --name novelai-router \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 127.0.0.1:4000:4000 \
  -v novelai-router-data:/data \
  -e WEB_ORIGIN=http://localhost:3000 \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD=change-me-admin-password \
  ezusagi43/novelai-router:latest
```

The GitHub Actions workflow at `.github/workflows/docker-image.yml` builds and pushes `ezusagi43/novelai-router:latest` on every push to `main`. Configure these repository secrets before relying on the workflow:

```text
DOCKERHUB_USERNAME
DOCKERHUB_TOKEN
```

## Backend setup

```bash
cd backend
cp .env.example .env
pnpm install
```

Start the local infrastructure:

```bash
docker compose up -d
```

Prepare the database and start the API:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The API defaults to `http://localhost:4000/api` when using the provided `.env.example` values.

### Backend commands

```bash
pnpm dev                    # Build shared package and start the API in watch mode
pnpm build                  # Build shared package and API
pnpm start                  # Start the built API
pnpm typecheck              # Typecheck shared package and API
pnpm test                   # Run shared and API tests
pnpm db:generate            # Generate Prisma client
pnpm db:migrate             # Run Prisma migrations in development
pnpm db:seed                # Seed default/admin data
pnpm novelai:health-check   # Check configured NovelAI account health
pnpm novelai:smoke-test     # Run a NovelAI smoke test
```

## Backend API summary

Base path: `/api`

Important routes include:

| Area | Routes | Auth |
| --- | --- | --- |
| Health | `GET /api/health` | none |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | mixed |
| Assets | `POST /api/assets`, `GET /api/assets`, `GET /api/assets/:assetId/content` | user |
| Generations | `POST /api/generations`, `GET /api/generations`, `GET /api/generations/:jobId/events` | user |
| Admin | `GET /api/admin/overview`, settings, policies, ledger, account-pool routes | admin |
| NovelAI relay | supported managed generation, img2img, enhance, x4 upscale, and suggest-tags flows | user/admin depending on route |

See `backend/docs/backend-api-reference.md` for the complete route reference.

## Environment variables

### Frontend

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `NOVELAI_ROUTER_ORIGIN` | recommended | `http://127.0.0.1:4000` | Backend origin used by Next.js proxy routes. |

### Backend

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | `postgresql://postgres:postgres@127.0.0.1:5432/novelai_router` | Prisma PostgreSQL connection string. |
| `REDIS_URL` | yes | `redis://127.0.0.1:6379` | Redis connection for backend queue/event infrastructure. |
| `API_HOST` | no | `0.0.0.0` | API listen host. |
| `API_PORT` | no | `4000` | API listen port. |
| `WEB_ORIGIN` | yes | `http://localhost:3000` | Allowed frontend origin for CORS/session flows. |
| `ADMIN_EMAIL` | optional | `admin@example.com` | Seed bootstrap admin email. |
| `ADMIN_PASSWORD` | optional | `change-me-admin-password` | Seed bootstrap admin password; replace before real use. |
| `STORAGE_ROOT` | yes | `.data/storage` | Local or mounted storage root for generated assets and app-managed runtime secrets. |

Session and credential encryption material is managed by the backend storage/runtime configuration. Do not upload generated files under `.data/`.

## Local full-stack startup order

1. Start backend infrastructure:
   ```bash
   cd backend
   docker compose up -d
   ```
2. Start backend API:
   ```bash
   pnpm install
   pnpm db:generate
   pnpm db:migrate
   pnpm db:seed
   pnpm dev
   ```
3. Start frontend:
   ```bash
   cd ../frontend
   cp .env.example .env.local
   npm install
   npm run dev
   ```
4. Open the frontend at `http://localhost:3000`.
5. Register or log in, then use the admin console to verify backend readiness and configure NovelAI accounts/policies as needed.

## Upload checklist

Before uploading:

- [ ] Confirm `frontend/.env.local` and `backend/.env` are not included.
- [ ] Confirm `backend/**/.data/` is not included.
- [ ] Replace default admin credentials in your deployment secret manager.
- [ ] Set production `WEB_ORIGIN` to the deployed frontend URL.
- [ ] Set frontend `NOVELAI_ROUTER_ORIGIN` to the deployed backend URL.
- [ ] Provision PostgreSQL and Redis for production.
- [ ] Mount persistent storage for `STORAGE_ROOT` in production.
- [ ] Configure NovelAI credentials through the admin/account-pool flow after deployment.
- [ ] Run frontend `npm run check` and backend `pnpm typecheck && pnpm test` before release.

## Suggested repository options

### Option A: one repository

Upload `upload-package/` as a single repository. This keeps frontend, backend, screenshots, and shared deployment notes together.

### Option B: two repositories

Upload `upload-package/frontend/` and `upload-package/backend/` as separate repositories. If you do this, copy this README or the relevant sections into each repository so deployment instructions stay available.

## Notes for production deployment

- Serve the frontend and backend from HTTPS origins in production.
- Configure cookies/CORS using the real frontend origin through `WEB_ORIGIN`.
- Keep all real secrets in the hosting provider's secret manager, not in source control.
- Use persistent volumes or object storage-backed mounts for backend generated assets.
- Run database migrations before switching frontend traffic to the new backend.
