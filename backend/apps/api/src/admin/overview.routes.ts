import type { FastifyInstance } from "fastify";
import { adminOverviewSchema, galleryOrderResponseSchema } from "@novelai-router/shared";
import { requireAdmin } from "../auth/guards.js";
import { getPlatformSettings } from "../billing/billing.js";
import { prisma } from "../db.js";
import { getAccountLeaseSnapshot } from "../novelai/accountPool.js";
import { tryDecryptCredential, unreadableCredentialErrorCode } from "../novelai/credentials.js";
import { getNovelAiReadiness } from "../novelai/readiness.js";
import { getGalleryOrder, refreshGalleryOrder } from "../runtimeConfig.js";

export async function overviewRoutes(app: FastifyInstance) {
  app.get("/api/gallery-order", async () => galleryOrderResponseSchema.parse(getGalleryOrder()));

  app.post("/api/admin/overview/gallery-order/refresh", { preHandler: requireAdmin }, async () => {
    return galleryOrderResponseSchema.parse(refreshGalleryOrder());
  });

  app.get("/api/admin/overview", { preHandler: requireAdmin }, async () => {
    const last24hCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [accounts, settings, policies, recentJobs, generationCounts, last24h, totalTrackedAnlas, storageTotals] = await Promise.all([
      prisma.novelAiAccount.findMany({
        select: {
          id: true,
          status: true,
          credentialCiphertext: true,
          credentialIv: true,
          credentialAuthTag: true,
          credentialKeyVersion: true,
          lastErrorCode: true,
        },
      }),
      getPlatformSettings(),
      prisma.parameterPolicy.findMany({
        select: {
          id: true,
          enabled: true,
        },
      }),
      prisma.generationJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          createdAt: true,
          actualNovelAiAnlas: true,
          estimatedNovelAiAnlas: true,
          billedPlatformUnits: true,
          novelAiAccountId: true,
        },
      }),
      prisma.generationJob.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.generationJob.count({
        where: {
          createdAt: { gte: last24hCutoff },
        },
      }),
      prisma.generationJob.aggregate({
        _sum: { actualNovelAiAnlas: true },
      }),
      prisma.asset.aggregate({
        _sum: { byteSize: true },
      }),
    ]);

    const leases = await Promise.all(accounts.map((account) => getAccountLeaseSnapshot(account.id)));
    const credentialErrorAccountIds = new Set(accounts.filter((account) => {
      if (account.lastErrorCode === unreadableCredentialErrorCode) {
        return true;
      }

      return !tryDecryptCredential({
        credentialCiphertext: account.credentialCiphertext,
        credentialIv: account.credentialIv,
        credentialAuthTag: account.credentialAuthTag,
        credentialKeyVersion: account.credentialKeyVersion,
      }).ok;
    }).map((account) => account.id));

    const readiness = getNovelAiReadiness({
      configuredAccountCount: accounts.length,
      activeAccountCount: accounts.filter((account) => account.status === "ACTIVE" && !credentialErrorAccountIds.has(account.id)).length,
      credentialErrorAccountCount: credentialErrorAccountIds.size,
    });

    const countsByStatus = new Map(generationCounts.map((entry) => [entry.status, entry._count._all]));

    return adminOverviewSchema.parse({
      generatedAt: new Date().toISOString(),
      readiness,
      accounts: {
        total: accounts.length,
        active: accounts.filter((account) => account.status === "ACTIVE").length,
        disabled: accounts.filter((account) => account.status === "DISABLED").length,
        cooldown: accounts.filter((account) => account.status === "COOLDOWN").length,
        error: accounts.filter((account) => account.status === "ERROR").length,
        leased: leases.filter((lease) => lease.leased).length,
      },
      generations: {
        total: generationCounts.reduce((sum, entry) => sum + entry._count._all, 0),
        last24h,
        queued: countsByStatus.get("QUEUED") ?? 0,
        running: countsByStatus.get("RUNNING") ?? 0,
        succeeded: countsByStatus.get("SUCCEEDED") ?? 0,
        failed: countsByStatus.get("FAILED") ?? 0,
        cancelled: countsByStatus.get("CANCELLED") ?? 0,
        totalTrackedAnlas: totalTrackedAnlas._sum.actualNovelAiAnlas ?? 0,
      },
      policies: {
        total: policies.length,
        enabled: policies.filter((policy) => policy.enabled).length,
        disabled: policies.filter((policy) => !policy.enabled).length,
      },
      storage: {
        totalBytes: storageTotals._sum.byteSize ?? 0,
      },
      settings: {
        anlasMultiplier: Number(settings.anlasMultiplier),
        updatedAt: settings.updatedAt.toISOString(),
      },
      galleryOrder: getGalleryOrder(),
      recentJobs: recentJobs.map((job) => ({
        id: job.id,
        status: job.status,
        createdAt: job.createdAt.toISOString(),
        actualNovelAiAnlas: job.actualNovelAiAnlas,
        estimatedNovelAiAnlas: job.estimatedNovelAiAnlas,
        billedPlatformUnits: job.billedPlatformUnits,
        novelAiAccountId: job.novelAiAccountId,
      })),
    });
  });
}
