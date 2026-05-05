import { randomUUID } from "node:crypto";
import type { NovelAiCredentialPayload } from "@novelai-router/shared";
import { prisma } from "../db.js";
import { getRuntimeConfig } from "../runtimeConfig.js";
import { redis } from "../redis.js";
import { tryDecryptCredential, unreadableCredentialErrorCode, unreadableCredentialErrorMessage } from "./credentials.js";

const workerId = `${process.pid}-${randomUUID()}`;

type LeaseValue = {
  leaseId: string;
  accountId: string;
  generationJobId: string;
  workerId: string;
  acquiredAt: string;
};

export class AccountPoolError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export type NovelAiAccountLease = {
  accountId: string;
  credential: NovelAiCredentialPayload;
  heartbeat: () => Promise<void>;
  release: () => Promise<void>;
  markSuccess: () => Promise<void>;
  markFailure: (error: unknown) => Promise<void>;
};

export async function acquireNovelAiAccountLease(generationJobId: string): Promise<NovelAiAccountLease> {
  const deadline = Date.now() + getRuntimeConfig().novelAiAccountAcquireTimeoutMs;
  let sawUnreadableCredentials = false;

  do {
    const result = await tryAcquireOnce(generationJobId);
    if (result.lease) return result.lease;
    sawUnreadableCredentials = sawUnreadableCredentials || result.unreadableCredentialCount > 0;
    await sleep(250);
  } while (Date.now() < deadline);

  if (sawUnreadableCredentials || await hasUnreadableCredentialAccounts()) {
    throw new AccountPoolError(unreadableCredentialErrorCode, unreadableCredentialErrorMessage);
  }

  throw new AccountPoolError("NO_NOVELAI_ACCOUNT_AVAILABLE", "No active NovelAI account is currently available");
}

export async function acquireNovelAiAccountLeaseById(accountId: string, generationJobId: string): Promise<NovelAiAccountLease> {
  const account = await prisma.novelAiAccount.findFirst({
    where: {
      id: accountId,
      status: "ACTIVE",
      OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: new Date() } }],
    },
  });
  if (!account) throw new AccountPoolError("NO_NOVELAI_ACCOUNT_AVAILABLE", "NovelAI account is not active or is cooling down");

  const leaseId = randomUUID();
  const value: LeaseValue = {
    leaseId,
    accountId: account.id,
    generationJobId,
    workerId,
    acquiredAt: new Date().toISOString(),
  };

  const acquired = await redis.set(
    leaseKey(account.id),
    JSON.stringify(value),
    "PX",
    getRuntimeConfig().novelAiAccountLeaseTtlMs,
    "NX",
  );

  if (acquired !== "OK") {
    throw new AccountPoolError("NO_NOVELAI_ACCOUNT_AVAILABLE", "NovelAI account is already leased");
  }

  const credentialResult = tryDecryptCredential({
    credentialCiphertext: account.credentialCiphertext,
    credentialIv: account.credentialIv,
    credentialAuthTag: account.credentialAuthTag,
    credentialKeyVersion: account.credentialKeyVersion,
  });
  if (!credentialResult.ok) {
    await releaseOwnedLease(account.id, leaseId);
    await markAccountCredentialUnreadable(account.id);
    throw new AccountPoolError(credentialResult.code, credentialResult.message);
  }

  return createLease(account.id, leaseId, credentialResult.credential);
}

export async function getAccountLeaseSnapshot(accountId: string) {
  const raw = await redis.get(leaseKey(accountId));
  if (!raw) {
    return { leased: false, leasedGenerationJobId: null, leaseTtlMs: null };
  }

  const ttl = await redis.pttl(leaseKey(accountId));
  const value = parseLeaseValue(raw);
  return {
    leased: true,
    leasedGenerationJobId: value?.generationJobId ?? null,
    leaseTtlMs: ttl >= 0 ? ttl : null,
  };
}

async function tryAcquireOnce(generationJobId: string): Promise<{ lease: NovelAiAccountLease | null; unreadableCredentialCount: number }> {
  const now = new Date();
  let unreadableCredentialCount = 0;
  const candidates = await prisma.novelAiAccount.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }],
    },
    orderBy: [{ priority: "asc" }, { lastUsedAt: "asc" }, { failureCount: "asc" }],
    take: 25,
  });

  for (const account of candidates) {
    const leaseId = randomUUID();
    const value: LeaseValue = {
      leaseId,
      accountId: account.id,
      generationJobId,
      workerId,
      acquiredAt: new Date().toISOString(),
    };
    const acquired = await redis.set(
      leaseKey(account.id),
      JSON.stringify(value),
      "PX",
      getRuntimeConfig().novelAiAccountLeaseTtlMs,
      "NX",
    );

    if (acquired !== "OK") continue;

    const credentialResult = tryDecryptCredential({
      credentialCiphertext: account.credentialCiphertext,
      credentialIv: account.credentialIv,
      credentialAuthTag: account.credentialAuthTag,
      credentialKeyVersion: account.credentialKeyVersion,
    });
    if (!credentialResult.ok) {
      unreadableCredentialCount += 1;
      await releaseOwnedLease(account.id, leaseId);
      await markAccountCredentialUnreadable(account.id);
      continue;
    }

    await prisma.novelAiAccount.update({
      where: { id: account.id },
      data: { lastUsedAt: new Date() },
    });

    return { lease: createLease(account.id, leaseId, credentialResult.credential), unreadableCredentialCount };
  }

  return { lease: null, unreadableCredentialCount };
}

function createLease(accountId: string, leaseId: string, credential: NovelAiCredentialPayload): NovelAiAccountLease {
  return {
    accountId,
    credential,
    heartbeat: () => extendOwnedLease(accountId, leaseId),
    release: () => releaseOwnedLease(accountId, leaseId),
    markSuccess: async () => {
      await prisma.novelAiAccount.update({
        where: { id: accountId },
        data: {
          status: "ACTIVE",
          cooldownUntil: null,
          lastSuccessAt: new Date(),
          failureCount: 0,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
    },
    markFailure: async (error) => {
      const code = getErrorCode(error);
      const data = failureData(code, getErrorMessage(error));
      await prisma.novelAiAccount.update({ where: { id: accountId }, data });
    },
  };
}

async function extendOwnedLease(accountId: string, leaseId: string) {
  await redis.eval(
    `
      local value = redis.call("GET", KEYS[1])
      if not value then return 0 end
      if string.find(value, ARGV[1], 1, true) then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      end
      return 0
    `,
    1,
    leaseKey(accountId),
    leaseId,
    getRuntimeConfig().novelAiAccountLeaseTtlMs,
  );
}

async function releaseOwnedLease(accountId: string, leaseId: string) {
  await redis.eval(
    `
      local value = redis.call("GET", KEYS[1])
      if not value then return 0 end
      if string.find(value, ARGV[1], 1, true) then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `,
    1,
    leaseKey(accountId),
    leaseId,
  );
}

function leaseKey(accountId: string) {
  return `novelai:account:${accountId}:lease`;
}

function parseLeaseValue(raw: string): LeaseValue | null {
  try {
    return JSON.parse(raw) as LeaseValue;
  } catch {
    return null;
  }
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "PROVIDER_ERROR";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Provider error";
}

async function hasUnreadableCredentialAccounts() {
  const count = await prisma.novelAiAccount.count({
    where: { status: "ERROR", lastErrorCode: unreadableCredentialErrorCode },
  });
  return count > 0;
}

async function markAccountCredentialUnreadable(accountId: string) {
  await prisma.novelAiAccount.update({
    where: { id: accountId },
    data: failureData(unreadableCredentialErrorCode, unreadableCredentialErrorMessage),
  });
}

function failureData(code: string, message: string) {
  const base = {
    lastFailureAt: new Date(),
    failureCount: { increment: 1 },
    lastErrorCode: code,
    lastErrorMessage: message,
  };

  if (code === "PROVIDER_AUTH_FAILED" || code === unreadableCredentialErrorCode) {
    return { ...base, status: "ERROR" as const };
  }

  if (code === "PROVIDER_RATE_LIMITED") {
    return {
      ...base,
      status: "COOLDOWN" as const,
      cooldownUntil: new Date(Date.now() + getRuntimeConfig().novelAiAccountCooldownMs),
    };
  }

  return base;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
