import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminLedgerListResponseSchema, adminPaginationQuerySchema, grantLedgerRequestSchema } from "@novelai-router/shared";
import { currentUser, requireAdmin } from "../auth/guards.js";
import { grantPlatformUnits } from "../billing/billing.js";
import { prisma } from "../db.js";

const userParamsSchema = z.object({ userId: z.string().min(1) });

export async function ledgerRoutes(app: FastifyInstance) {
  app.get("/api/admin/ledger", { preHandler: requireAdmin }, async (request) => {
    const query = adminPaginationQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.pageSize;

    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
        select: {
          id: true,
          userId: true,
          generationJobId: true,
          type: true,
          novelAiAnlas: true,
          multiplier: true,
          platformUnits: true,
          balanceAfter: true,
          createdByUserId: true,
          createdAt: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      }),
      prisma.ledgerEntry.count(),
    ]);

    const adminIds = [...new Set(entries.map((entry) => entry.createdByUserId).filter((value): value is string => Boolean(value)))];
    const admins = adminIds.length
      ? await prisma.user.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, email: true },
        })
      : [];
    const adminEmailById = new Map(admins.map((admin) => [admin.id, admin.email]));

    return adminLedgerListResponseSchema.parse({
      entries: entries.map((entry) => ({
        id: entry.id,
        userId: entry.userId,
        userEmail: entry.user.email,
        generationJobId: entry.generationJobId,
        type: entry.type,
        novelAiAnlas: entry.novelAiAnlas,
        multiplier: entry.multiplier ? Number(entry.multiplier) : null,
        platformUnits: entry.platformUnits,
        balanceAfter: entry.balanceAfter,
        createdByUserId: entry.createdByUserId,
        createdByUserEmail: entry.createdByUserId ? adminEmailById.get(entry.createdByUserId) ?? null : null,
        createdAt: entry.createdAt.toISOString(),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pageCount: total === 0 ? 0 : Math.ceil(total / query.pageSize),
      },
    });
  });

  app.post("/api/admin/users/:userId/ledger/grant", { preHandler: requireAdmin }, async (request) => {
    const params = userParamsSchema.parse(request.params);
    const body = grantLedgerRequestSchema.parse(request.body);
    const admin = currentUser(request);
    const entry = await grantPlatformUnits(params.userId, body.platformUnits, admin.id);
    return {
      id: entry.id,
      userId: entry.userId,
      type: entry.type,
      platformUnits: entry.platformUnits,
      balanceAfter: entry.balanceAfter,
      createdAt: entry.createdAt.toISOString(),
    };
  });
}
