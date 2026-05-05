import type { FastifyInstance } from "fastify";
import { authBalanceResponseSchema, loginRequestSchema, registerRequestSchema } from "@novelai-router/shared";
import { conflict, unauthorized } from "../errors.js";
import { prisma } from "../db.js";
import { currentUser, requireAuth } from "./guards.js";
import { createSession, getSessionUser, revokeSessionToken, setSessionCookie, clearSessionCookie, toPublicUser } from "./session.js";
import { hashPassword, verifyPassword } from "./password.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/register", async (request, reply) => {
    const body = registerRequestSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw conflict("EMAIL_ALREADY_REGISTERED", "Email is already registered");

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash: await hashPassword(body.password),
      },
    });
    const token = await createSession(user.id);
    setSessionCookie(reply, token);
    return { user: toPublicUser(user) };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginRequestSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || user.status !== "ACTIVE") throw unauthorized("Invalid email or password");

    const passwordOk = await verifyPassword(user.passwordHash, body.password);
    if (!passwordOk) throw unauthorized("Invalid email or password");

    const token = await createSession(user.id);
    setSessionCookie(reply, token);
    return { user: toPublicUser(user) };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = request.cookies["nar_session"];
    if (token) await revokeSessionToken(token);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (request) => {
    return { user: toPublicUser(currentUser(request)) };
  });

  app.get("/api/auth/balance", async (request) => {
    const user = await getSessionUser(request)
    if (!user) {
      return authBalanceResponseSchema.parse({ balance: 0 })
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { balance: true },
    })

    return authBalanceResponseSchema.parse({ balance: dbUser?.balance ?? 0 })
  })
}
