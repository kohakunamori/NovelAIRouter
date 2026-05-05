import type { FastifyInstance } from "fastify";
import { adminUserListResponseSchema, adminUserSummarySchema, deleteAdminUserResponseSchema, updateAdminUserRequestSchema } from "@novelai-router/shared";
import { z } from "zod";
import { currentUser, requireAdmin } from "../auth/guards.js";
import { prisma } from "../db.js";
import { badRequest, notFound } from "../errors.js";

const userParamsSchema = z.object({ userId: z.string().min(1) });

function serializeAdminUser(user: {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "DISABLED";
  balance: number;
  createdAt: Date;
  updatedAt: Date;
  _count: { generationJobs: number };
}) {
  return adminUserSummarySchema.parse({
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    balance: user.balance,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    generationCount: user._count.generationJobs,
  });
}

export async function usersRoutes(app: FastifyInstance) {
  app.get("/api/admin/users", { preHandler: requireAdmin }, async () => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        balance: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            generationJobs: true,
          },
        },
      },
    });

    return adminUserListResponseSchema.parse({
      users: users.map(serializeAdminUser),
    });
  });

  app.patch("/api/admin/users/:userId", { preHandler: requireAdmin }, async (request) => {
    const params = userParamsSchema.parse(request.params);
    const body = updateAdminUserRequestSchema.parse(request.body);
    const admin = currentUser(request);

    if (params.userId === admin.id && body.status === "DISABLED") {
      throw badRequest("CANNOT_DISABLE_CURRENT_ADMIN", "You cannot disable the current admin account");
    }

    const existingUser = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true } });
    if (!existingUser) {
      throw notFound("User not found");
    }

    const user = await prisma.user.update({
      where: { id: params.userId },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.balance !== undefined ? { balance: body.balance } : {}),
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        balance: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            generationJobs: true,
          },
        },
      },
    });

    return serializeAdminUser(user);
  });

  app.delete("/api/admin/users/:userId", { preHandler: requireAdmin }, async (request) => {
    const params = userParamsSchema.parse(request.params);
    const admin = currentUser(request);

    if (params.userId === admin.id) {
      throw badRequest("CANNOT_DELETE_CURRENT_ADMIN", "You cannot delete the current admin account");
    }

    const existingUser = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true } });
    if (!existingUser) {
      throw notFound("User not found");
    }

    await prisma.user.delete({ where: { id: params.userId } });
    return deleteAdminUserResponseSchema.parse({ ok: true });
  });
}
