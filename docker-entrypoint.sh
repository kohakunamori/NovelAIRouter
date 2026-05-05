#!/usr/bin/env bash
set -Eeuo pipefail

PGDATA="${PGDATA:-/data/postgres}"
POSTGRES_DB="${POSTGRES_DB:-novelai_router}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
DATABASE_URL="${DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}}"
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
API_HOST="${API_HOST:-0.0.0.0}"
API_PORT="${API_PORT:-4000}"
WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:3000}"
NOVELAI_ROUTER_ORIGIN="${NOVELAI_ROUTER_ORIGIN:-http://127.0.0.1:${API_PORT}}"
STORAGE_ROOT="${STORAGE_ROOT:-/data/storage}"
PORT="${PORT:-3000}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-change-me-admin-password}"

export PGDATA POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DATABASE_URL REDIS_URL API_HOST API_PORT WEB_ORIGIN NOVELAI_ROUTER_ORIGIN STORAGE_ROOT PORT HOSTNAME ADMIN_EMAIL ADMIN_PASSWORD

mkdir -p "$PGDATA" /data/redis "$STORAGE_ROOT" /var/run/postgresql
chown -R postgres:postgres "$PGDATA" /var/run/postgresql
chown -R redis:redis /data/redis
chown -R node:node "$STORAGE_ROOT"
chmod 700 "$PGDATA" 2>/dev/null || true

pids=()

shutdown() {
  set +e
  for pid in "${pids[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
  gosu postgres pg_ctl -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
}

trap shutdown INT TERM EXIT

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  gosu postgres initdb -D "$PGDATA" --username="$POSTGRES_USER" --auth=trust
fi

gosu postgres postgres -D "$PGDATA" -c listen_addresses=127.0.0.1 -c port=5432 -c unix_socket_directories=/var/run/postgresql &
postgres_pid=$!
pids+=("$postgres_pid")

gosu redis redis-server --bind 127.0.0.1 --port 6379 --dir /data/redis --appendonly yes --save 60 1 --daemonize no &
redis_pid=$!
pids+=("$redis_pid")

for _ in {1..60}; do
  if pg_isready -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! pg_isready -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
  echo "PostgreSQL did not become ready" >&2
  exit 1
fi

createdb -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" "$POSTGRES_DB" >/dev/null 2>&1 || true

for _ in {1..60}; do
  if redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
  echo "Redis did not become ready" >&2
  exit 1
fi

cd /app/backend
gosu node ./apps/api/node_modules/.bin/prisma migrate deploy --schema ./apps/api/prisma/schema.prisma
gosu node node ./apps/api/dist/prisma/seed.js
gosu node node ./apps/api/dist/src/main.js &
api_pid=$!
pids+=("$api_pid")

api_ready=0
for _ in {1..60}; do
  if ! kill -0 "$api_pid" >/dev/null 2>&1; then
    wait "$api_pid"
  fi
  if node -e "fetch('http://127.0.0.1:' + process.env.API_PORT + '/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    api_ready=1
    break
  fi
  sleep 1
done

if [ "$api_ready" -ne 1 ]; then
  echo "API did not become ready" >&2
  exit 1
fi

cd /app/frontend
gosu node node server.js &
frontend_pid=$!
pids+=("$frontend_pid")

wait -n "$api_pid" "$frontend_pid" "$redis_pid" "$postgres_pid"
