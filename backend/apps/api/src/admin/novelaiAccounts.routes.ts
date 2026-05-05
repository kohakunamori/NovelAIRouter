import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createNovelAiAccountRequestSchema,
  novelAiAccountSummarySchema,
  rotateNovelAiCredentialRequestSchema,
  testNovelAiAccountRequestSchema,
  testNovelAiAccountResponseSchema,
  updateNovelAiAccountRequestSchema,
} from "@novelai-router/shared";
import { currentUser, requireAdmin } from "../auth/guards.js";
import { prisma } from "../db.js";
import { badRequest, notFound } from "../errors.js";
import { getRuntimeConfig } from "../runtimeConfig.js";
import { assertNovelAiAccountTestModeAllowed } from "./novelaiAccountTestPolicy.js";
import { acquireNovelAiAccountLeaseById, getAccountLeaseSnapshot } from "../novelai/accountPool.js";
import {
  encryptCredential,
  maskCredentialMetadata,
  tryDecryptCredential,
  unreadableCredentialMetadata,
  type EncryptedCredentialRecord,
} from "../novelai/credentials.js";
import { createNovelAiProvider } from "../novelai/providerFactory.js";
import { getNovelAiReadiness } from "../novelai/readiness.js";

const accountParamsSchema = z.object({ accountId: z.string().min(1) });

export async function novelAiAccountsRoutes(app: FastifyInstance) {
  app.get("/api/admin/novelai/accounts", { preHandler: requireAdmin }, async () => {
    const accounts = await prisma.novelAiAccount.findMany({
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });
    const runtimeConfig = getRuntimeConfig();

    const serializedAccounts = await Promise.all(accounts.map((account, index) => serializeAccount(account, index)));

    return {
      accounts: serializedAccounts,
      config: {
        proxyConfigured: Boolean(runtimeConfig.novelAiProxyUrl),
        healthChecksEnabled: runtimeConfig.novelAiAdminHealthChecksEnabled,
        smokeTestsEnabled: runtimeConfig.novelAiSmokeTestsEnabled,
        readiness: getNovelAiReadiness({
          configuredAccountCount: serializedAccounts.length,
          activeAccountCount: serializedAccounts.filter((account) => account.status === "ACTIVE").length,
          credentialErrorAccountCount: serializedAccounts.filter((account) => account.lastErrorCode === "NOVELAI_CREDENTIAL_DECRYPT_FAILED").length,
        }),
      },
    };
  });

  app.post("/api/admin/novelai/accounts", { preHandler: requireAdmin }, async (request) => {
    const body = createNovelAiAccountRequestSchema.parse(request.body);
    const admin = currentUser(request);
    const encrypted = encryptCredential(body.credential);

    const account = await prisma.novelAiAccount.create({
      data: {
        label: body.label,
        credentialKind: body.credentialKind,
        ...encrypted,
        priority: body.priority,
        maxConcurrentJobs: body.maxConcurrentJobs,
        createdByUserId: admin.id,
        updatedByUserId: admin.id,
      },
    });

    return serializeAccount(account);
  });

  app.patch("/api/admin/novelai/accounts/:accountId", { preHandler: requireAdmin }, async (request) => {
    const params = accountParamsSchema.parse(request.params);
    const body = updateNovelAiAccountRequestSchema.parse(request.body);
    const admin = currentUser(request);
    await requireAccount(params.accountId);

    const account = await prisma.novelAiAccount.update({
      where: { id: params.accountId },
      data: {
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.maxConcurrentJobs !== undefined ? { maxConcurrentJobs: body.maxConcurrentJobs } : {}),
        ...(body.cooldownUntil !== undefined
          ? { cooldownUntil: body.cooldownUntil === null ? null : new Date(body.cooldownUntil) }
          : {}),
        updatedByUserId: admin.id,
      },
    });

    return serializeAccount(account);
  });

  app.post("/api/admin/novelai/accounts/:accountId/rotate-credential", { preHandler: requireAdmin }, async (request) => {
    const params = accountParamsSchema.parse(request.params);
    const body = rotateNovelAiCredentialRequestSchema.parse(request.body);
    const admin = currentUser(request);
    await requireAccount(params.accountId);
    const encrypted = encryptCredential(body.credential);

    const account = await prisma.novelAiAccount.update({
      where: { id: params.accountId },
      data: {
        credentialKind: body.credentialKind,
        ...encrypted,
        updatedByUserId: admin.id,
      },
    });

    return serializeAccount(account);
  });

  app.post("/api/admin/novelai/accounts/:accountId/enable", { preHandler: requireAdmin }, async (request) => {
    const params = accountParamsSchema.parse(request.params);
    const admin = currentUser(request);
    await requireAccount(params.accountId);
    const account = await prisma.novelAiAccount.update({
      where: { id: params.accountId },
      data: { status: "ACTIVE", cooldownUntil: null, updatedByUserId: admin.id },
    });
    return serializeAccount(account);
  });

  app.post("/api/admin/novelai/accounts/:accountId/disable", { preHandler: requireAdmin }, async (request) => {
    const params = accountParamsSchema.parse(request.params);
    const admin = currentUser(request);
    await requireAccount(params.accountId);
    const account = await prisma.novelAiAccount.update({
      where: { id: params.accountId },
      data: { status: "DISABLED", updatedByUserId: admin.id },
    });
    return serializeAccount(account);
  });

  app.delete("/api/admin/novelai/accounts/:accountId", { preHandler: requireAdmin }, async (request) => {
    const params = accountParamsSchema.parse(request.params);
    await requireAccount(params.accountId);
    const lease = await getAccountLeaseSnapshot(params.accountId);

    if (lease.leased) {
      throw badRequest("ACCOUNT_LEASED", "Cannot delete an upstream account while it is leased to a generation job");
    }

    await prisma.novelAiAccount.delete({ where: { id: params.accountId } });
    return { ok: true };
  });

  app.post("/api/admin/novelai/accounts/:accountId/test", { preHandler: requireAdmin }, async (request) => {
    const params = accountParamsSchema.parse(request.params);
    const body = testNovelAiAccountRequestSchema.parse(request.body);
    const account = await requireAccount(params.accountId);
    const provider = createNovelAiProvider();

    const runtimeConfig = getRuntimeConfig();

    assertNovelAiAccountTestModeAllowed(body, {
      healthChecksEnabled: runtimeConfig.novelAiAdminHealthChecksEnabled,
      smokeTestsEnabled: runtimeConfig.novelAiSmokeTestsEnabled,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), runtimeConfig.novelAiTestTimeoutMs);
    let lease: Awaited<ReturnType<typeof acquireNovelAiAccountLeaseById>> | undefined;

    try {
      lease = await acquireNovelAiAccountLeaseById(account.id, `admin-${body.mode}-${Date.now()}`);

      const result = body.mode === "health_check"
        ? await provider.healthCheckAccount({ accountId: account.id, credential: lease.credential, signal: controller.signal })
        : await provider.smokeTestAccount({ accountId: account.id, credential: lease.credential, signal: controller.signal });

      const updated = await prisma.novelAiAccount.update({
        where: { id: params.accountId },
        data: {
          lastCheckedAt: new Date(),
          lastSuccessAt: new Date(),
          failureCount: 0,
          lastErrorCode: null,
          lastErrorMessage: null,
          remoteAccountLabel: result.remote?.accountLabel ?? account.remoteAccountLabel,
          remoteAnlasBalance: result.remote?.anlasBalance ?? account.remoteAnlasBalance,
          remoteTier: result.remote?.tier ?? account.remoteTier,
          remoteActive: result.remote?.active ?? account.remoteActive,
          remoteUnlimitedImageGeneration: result.remote?.unlimitedImageGeneration ?? account.remoteUnlimitedImageGeneration,
          remoteMaxPriorityActions: result.remote?.maxPriorityActions ?? account.remoteMaxPriorityActions,
          remoteFixedTrainingStepsLeft: result.remote?.fixedTrainingStepsLeft ?? account.remoteFixedTrainingStepsLeft,
          remotePurchasedTrainingSteps: result.remote?.purchasedTrainingSteps ?? account.remotePurchasedTrainingSteps,
        },
      });
      await lease?.markSuccess();

      return testNovelAiAccountResponseSchema.parse({ ...result, mode: body.mode, account: await serializeAccount(updated) });
    } catch (error) {
      await lease?.markFailure(error);
      const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "ACCOUNT_TEST_FAILED";
      const message = error instanceof Error ? error.message : "Account test failed";
      await prisma.novelAiAccount.update({
        where: { id: params.accountId },
        data: {
          lastCheckedAt: new Date(),
          lastFailureAt: new Date(),
          failureCount: { increment: 1 },
          lastErrorCode: code,
          lastErrorMessage: message,
        },
      });
      throw error;
    } finally {
      clearTimeout(timeout);
      await lease?.release();
    }
  });
}

async function requireAccount(accountId: string) {
  const account = await prisma.novelAiAccount.findUnique({ where: { id: accountId } });
  if (!account) throw notFound("NovelAI account not found");
  return account;
}

async function serializeAccount(account: Awaited<ReturnType<typeof requireAccount>>, index = 0) {
  const lease = await getAccountLeaseSnapshot(account.id);
  const credentialResult = tryDecryptCredential(toEncryptedCredentialRecord(account));
  const isCredentialUnreadable = !credentialResult.ok;

  return novelAiAccountSummarySchema.parse({
    id: account.id,
    label: isCredentialUnreadable ? `error_account_${index + 1}` : account.label,
    status: isCredentialUnreadable ? "ERROR" : account.status,
    credentialKind: account.credentialKind,
    credentialKeyVersion: account.credentialKeyVersion,
    credentialMetadata: credentialResult.ok ? maskCredentialMetadata(credentialResult.credential) : unreadableCredentialMetadata(),
    priority: account.priority,
    maxConcurrentJobs: account.maxConcurrentJobs,
    cooldownUntil: account.cooldownUntil?.toISOString() ?? null,
    lastUsedAt: account.lastUsedAt?.toISOString() ?? null,
    lastCheckedAt: account.lastCheckedAt?.toISOString() ?? null,
    lastSuccessAt: account.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: account.lastFailureAt?.toISOString() ?? null,
    failureCount: account.failureCount,
    lastErrorCode: credentialResult.ok ? account.lastErrorCode : credentialResult.code,
    lastErrorMessage: credentialResult.ok ? account.lastErrorMessage : credentialResult.message,
    remoteAccountLabel: account.remoteAccountLabel,
    remoteAnlasBalance: account.remoteAnlasBalance,
    remoteTier: account.remoteTier,
    remoteActive: account.remoteActive,
    remoteUnlimitedImageGeneration: account.remoteUnlimitedImageGeneration,
    remoteMaxPriorityActions: account.remoteMaxPriorityActions,
    remoteFixedTrainingStepsLeft: account.remoteFixedTrainingStepsLeft,
    remotePurchasedTrainingSteps: account.remotePurchasedTrainingSteps,
    leased: lease.leased,
    leasedGenerationJobId: lease.leasedGenerationJobId,
    leaseTtlMs: lease.leaseTtlMs,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  });
}

function toEncryptedCredentialRecord(account: {
  credentialCiphertext: string;
  credentialIv: string;
  credentialAuthTag: string;
  credentialKeyVersion: number;
}): EncryptedCredentialRecord {
  return {
    credentialCiphertext: account.credentialCiphertext,
    credentialIv: account.credentialIv,
    credentialAuthTag: account.credentialAuthTag,
    credentialKeyVersion: account.credentialKeyVersion,
  };
}
