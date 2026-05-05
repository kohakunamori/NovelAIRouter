import type { FastifyInstance } from "fastify";
import {
  adminJobDetailResponseSchema,
  adminJobListResponseSchema,
  adminJobsQuerySchema,
  adminPaginationQuerySchema,
  deleteAdminJobsPageRequestSchema,
  deleteAdminJobsPageResponseSchema,
} from "@novelai-router/shared";
import { requireAdmin } from "../auth/guards.js";
import { prisma } from "../db.js";
import { binaryStorage } from "../storage/index.js";

async function loadAdminJobsPage(page: number, pageSize: number, filters?: { userId?: string; novelAiAccountId?: string }) {
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {}
  if (filters?.userId) {
    where.userId = filters.userId
  }
  if (filters?.novelAiAccountId) {
    where.novelAiAccountId = filters.novelAiAccountId
  }

  const [jobs, total] = await Promise.all([
    prisma.generationJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        status: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        estimatedNovelAiAnlas: true,
        actualNovelAiAnlas: true,
        billedPlatformUnits: true,
        resultMimeType: true,
        intermediateOutputCount: true,
        intermediateOutputSseBytes: true,
        errorCode: true,
        errorMessage: true,
        submittedParamsJson: true,
        normalizedParamsJson: true,
        _count: {
          select: { outputs: true },
        },
        outputs: {
          select: {
            asset: {
              select: { byteSize: true },
            },
          },
        },
        user: {
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
        },
        novelAiAccount: {
          select: {
            id: true,
            label: true,
            remoteAccountLabel: true,
          },
        },
      },
    }),
    prisma.generationJob.count({ where }),
  ]);

  return adminJobListResponseSchema.parse({
    jobs: jobs.map((job) => ({
      id: job.id,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      outputBytes: job.outputs.reduce((total, output) => total + output.asset.byteSize, 0),
      intermediateOutputCount: job.intermediateOutputCount,
      intermediateOutputSseBytes: job.intermediateOutputSseBytes,
      estimatedNovelAiAnlas: job.estimatedNovelAiAnlas,
      actualNovelAiAnlas: job.actualNovelAiAnlas,
      billedPlatformUnits: job.billedPlatformUnits,
      outputCount: job._count.outputs,
      resultMimeType: job.resultMimeType,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      submittedParamsJson: job.submittedParamsJson,
      normalizedParamsJson: job.normalizedParamsJson,
      user: {
        id: job.user.id,
        email: job.user.email,
        role: job.user.role,
        status: job.user.status,
        balance: job.user.balance,
        createdAt: job.user.createdAt.toISOString(),
        updatedAt: job.user.updatedAt.toISOString(),
        generationCount: job.user._count.generationJobs,
      },
      upstreamAccount: job.novelAiAccount
        ? {
            id: job.novelAiAccount.id,
            label: job.novelAiAccount.label,
            remoteAccountLabel: job.novelAiAccount.remoteAccountLabel,
          }
        : null,
    })),
    pagination: {
      page,
      pageSize,
      total,
      pageCount: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
  });
}

export async function jobsRoutes(app: FastifyInstance) {
  app.get("/api/admin/jobs", { preHandler: requireAdmin }, async (request) => {
    const query = adminJobsQuerySchema.parse(request.query);
    const filters: { userId?: string; novelAiAccountId?: string } = {};
    if (query.userId) filters.userId = query.userId;
    if (query.novelAiAccountId) filters.novelAiAccountId = query.novelAiAccountId;
    return loadAdminJobsPage(query.page, query.pageSize, filters);
  });

  app.get("/api/admin/jobs/:jobId", { preHandler: requireAdmin }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        resultMimeType: true,
        _count: { select: { outputs: true } },
        outputs: {
          orderBy: { index: "asc" },
          select: {
            index: true,
            asset: {
              select: {
                id: true,
                mimeType: true,
                originalFilename: true,
              },
            },
          },
        },
      },
    });

    if (!job) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Job not found" } });
    }

    return adminJobDetailResponseSchema.parse({
      id: job.id,
      status: job.status,
      outputCount: job._count.outputs,
      resultMimeType: job.resultMimeType,
      outputs: job.outputs.map((output) => ({
        index: output.index,
        asset: {
          id: output.asset.id,
          mimeType: output.asset.mimeType,
          originalFilename: output.asset.originalFilename,
        },
      })),
    });
  });

  app.get("/api/admin/jobs/:jobId/results/:index", { preHandler: requireAdmin }, async (request, reply) => {
    const { jobId, index } = request.params as { jobId: string; index: string };
    const outputIndex = Number(index);

    if (!Number.isInteger(outputIndex) || outputIndex < 0) {
      return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "Invalid output index" } });
    }

    const output = await prisma.generationOutput.findUnique({
      where: {
        generationJobId_index: {
          generationJobId: jobId,
          index: outputIndex,
        },
      },
      include: { asset: true },
    });

    if (!output) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Result not available" } });
    }

    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.type(output.asset.mimeType);
    return reply.send(binaryStorage.createReadStream(output.asset.storageKey));
  });

  app.post("/api/admin/jobs/delete-page", { preHandler: requireAdmin }, async (request) => {
    const body = deleteAdminJobsPageRequestSchema.parse(request.body);
    const skip = (body.page - 1) * body.pageSize;

    const jobs = await prisma.generationJob.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: body.pageSize,
      select: {
        id: true,
        outputs: {
          select: {
            asset: {
              select: {
                id: true,
                storageKey: true,
              },
            },
          },
        },
      },
    });

    const jobIds = jobs.map((job) => job.id);
    if (jobIds.length === 0) {
      return deleteAdminJobsPageResponseSchema.parse({ deletedCount: 0 });
    }

    const assets = jobs.flatMap((job) => job.outputs.map((output) => output.asset));
    const uniqueAssets = [...new Map(assets.map((asset) => [asset.id, asset])).values()];

    await prisma.$transaction(async (tx) => {
      await tx.generationJob.deleteMany({
        where: { id: { in: jobIds } },
      });

      if (uniqueAssets.length > 0) {
        await tx.asset.deleteMany({
          where: { id: { in: uniqueAssets.map((asset) => asset.id) } },
        });
      }
    });

    await Promise.all(uniqueAssets.map((asset) => binaryStorage.delete(asset.storageKey)));

    return deleteAdminJobsPageResponseSchema.parse({ deletedCount: jobIds.length });
  });

  app.delete("/api/admin/jobs/:id", { preHandler: requireAdmin }, async (request) => {
    const id = (request.params as { id: string }).id;

    const job = await prisma.generationJob.findUnique({
      where: { id },
      select: {
        id: true,
        outputs: {
          select: {
            asset: {
              select: {
                id: true,
                storageKey: true,
              },
            },
          },
        },
      },
    });

    if (!job) {
      return deleteAdminJobsPageResponseSchema.parse({ deletedCount: 0 });
    }

    const assets = job.outputs.map((output) => output.asset);
    const uniqueAssets = [...new Map(assets.map((asset) => [asset.id, asset])).values()];

    await prisma.$transaction(async (tx) => {
      await tx.generationJob.delete({ where: { id } });

      if (uniqueAssets.length > 0) {
        await tx.asset.deleteMany({
          where: { id: { in: uniqueAssets.map((asset) => asset.id) } },
        });
      }
    });

    await Promise.all(uniqueAssets.map((asset) => binaryStorage.delete(asset.storageKey)));

    return deleteAdminJobsPageResponseSchema.parse({ deletedCount: 1 });
  });
}
