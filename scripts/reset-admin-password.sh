#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-novelai-router}"
ADMIN_EMAIL="${ADMIN_EMAIL:-lostcitycloud@foxmail.com}"
POSTGRES_DB="${POSTGRES_DB:-novelai_router}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
DATABASE_URL="${DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}}"

if [ $# -lt 1 ]; then
  echo "Usage: $0 '<new-admin-password>'"
  echo "Password must not be empty."
  exit 1
fi

NEW_ADMIN_PASSWORD="$1"

if [ -z "$NEW_ADMIN_PASSWORD" ]; then
  echo "Error: password must not be empty."
  exit 1
fi

docker exec -i \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e NEW_ADMIN_PASSWORD="$NEW_ADMIN_PASSWORD" \
  -e DATABASE_URL="$DATABASE_URL" \
  "$CONTAINER_NAME" \
  sh -lc 'cd /app/backend/apps/api && node --input-type=module' <<'NODE'
import { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "./dist/src/auth/password.js";

const prisma = new PrismaClient();
const email = process.env.ADMIN_EMAIL.toLowerCase();
const password = process.env.NEW_ADMIN_PASSWORD;

if (!password) {
  throw new Error("NEW_ADMIN_PASSWORD must not be empty");
}

const passwordHash = await hashPassword(password);

await prisma.user.upsert({
  where: { email },
  create: {
    email,
    passwordHash,
    role: UserRole.ADMIN,
  },
  update: {
    passwordHash,
    role: UserRole.ADMIN,
  },
});

await prisma.$disconnect();
console.log("Password reset for " + email);
NODE
