ARG NODE_VERSION=24.14.1-slim

FROM node:${NODE_VERSION} AS backend-builder

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy
ARG NO_PROXY
ARG no_proxy

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV http_proxy=${http_proxy}
ENV https_proxy=${https_proxy}
ENV NO_PROXY=${NO_PROXY}
ENV no_proxy=${no_proxy}

WORKDIR /build/backend

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
COPY backend/apps/api/package.json ./apps/api/package.json
COPY backend/packages/shared/package.json ./packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY backend/ ./

ENV DATABASE_URL=postgresql://postgres@127.0.0.1:5432/novelai_router
ENV REDIS_URL=redis://127.0.0.1:6379
ENV STORAGE_ROOT=/tmp/storage

RUN pnpm db:generate && pnpm build

FROM node:${NODE_VERSION} AS frontend-builder

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy
ARG NO_PROXY
ARG no_proxy

ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV http_proxy=${http_proxy}
ENV https_proxy=${https_proxy}
ENV NO_PROXY=${NO_PROXY}
ENV no_proxy=${no_proxy}

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./

RUN if [ -n "$HTTP_PROXY" ]; then npm config set proxy "$HTTP_PROXY"; fi \
  && if [ -n "$HTTPS_PROXY" ]; then npm config set https-proxy "$HTTPS_PROXY"; fi \
  && npm ci --no-audit --no-fund

COPY frontend/ ./

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

FROM node:${NODE_VERSION} AS runner

LABEL org.opencontainers.image.title="NovelAI Router All-in-One"
LABEL org.opencontainers.image.description="Single-container NovelAI Router with PostgreSQL, Redis, Fastify API, and Next.js frontend."

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PGDATA=/data/postgres
ENV POSTGRES_DB=novelai_router
ENV POSTGRES_USER=postgres
ENV API_HOST=0.0.0.0
ENV API_PORT=4000
ENV WEB_ORIGIN=http://localhost:3000
ENV ADMIN_EMAIL=admin@example.com
ENV STORAGE_ROOT=/data/storage
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    gosu \
    openssl \
    postgresql \
    redis-server \
    tini \
  && rm -rf /var/lib/apt/lists/* \
  && if ! id redis >/dev/null 2>&1; then useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin redis; fi \
  && pg_bindir="$(dirname "$(find /usr/lib/postgresql -name initdb -type f | sort -V | tail -n 1)")" \
  && for bin in initdb postgres pg_ctl createdb psql pg_isready; do ln -sf "$pg_bindir/$bin" "/usr/local/bin/$bin"; done \
  && mkdir -p /app/backend /app/frontend /data/postgres /data/redis /data/storage /var/run/postgresql \
  && chown -R node:node /app /data/storage \
  && chown -R postgres:postgres /data/postgres /var/run/postgresql \
  && chown -R redis:redis /data/redis

WORKDIR /app

COPY --from=backend-builder --chown=node:node /build/backend /app/backend
COPY --from=frontend-builder --chown=node:node /build/frontend/public /app/frontend/public
COPY --from=frontend-builder --chown=node:node /build/frontend/.next/standalone /app/frontend
COPY --from=frontend-builder --chown=node:node /build/frontend/.next/static /app/frontend/.next/static
COPY docker-entrypoint.sh /usr/local/bin/novelai-router-entrypoint

RUN chmod +x /usr/local/bin/novelai-router-entrypoint

VOLUME ["/data"]

EXPOSE 3000 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/novelai-router-entrypoint"]
