import type { FastifyReply, FastifyRequest } from "fastify";
import { forbidden, unauthorized } from "../errors.js";
import { getSessionUser, type AuthUser } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const user = await getSessionUser(request);
  if (!user) throw unauthorized();
  request.user = user;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (request.user?.role !== "ADMIN") throw forbidden("Admin access required");
}

export function currentUser(request: FastifyRequest) {
  if (!request.user) throw unauthorized();
  return request.user;
}
