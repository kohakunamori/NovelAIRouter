import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db.js";

const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;

export type AuthUser = {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "DISABLED";
  createdAt: Date;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + sessionMaxAgeSeconds * 1000),
    },
  });
  return token;
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie("nar_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAgeSeconds,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie("nar_session", { path: "/" });
}

export async function revokeSessionToken(token: string) {
  await prisma.session.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getSessionUser(request: FastifyRequest): Promise<AuthUser | null> {
  const token = request.cookies["nar_session"];
  if (!token) return null;

  const session = await prisma.session.findFirst({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!session || session.user.status !== "ACTIVE") return null;

  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
    status: session.user.status,
    createdAt: session.user.createdAt,
  };
}

export function toPublicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}
