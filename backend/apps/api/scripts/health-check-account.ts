import { prisma } from "../src/db.js";
import { decryptCredential } from "../src/novelai/credentials.js";
import { RealNovelAiProvider } from "../src/novelai/realNovelAiProvider.js";

const requestedAccountId = process.argv[2] ?? null;
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15_000);

try {
  const account = await prisma.novelAiAccount.findFirst({
    where: requestedAccountId ? { id: requestedAccountId } : { status: "ACTIVE" },
    orderBy: { priority: "asc" },
  });

  if (!account) {
    throw new Error(requestedAccountId ? `NovelAI account ${requestedAccountId} not found` : "No active NovelAI account found");
  }

  const credential = decryptCredential({
    credentialCiphertext: account.credentialCiphertext,
    credentialIv: account.credentialIv,
    credentialAuthTag: account.credentialAuthTag,
    credentialKeyVersion: account.credentialKeyVersion,
  });

  const provider = new RealNovelAiProvider();
  const result = await provider.healthCheckAccount({
    accountId: account.id,
    credential,
    signal: controller.signal,
  });

  const updated = await prisma.novelAiAccount.update({
    where: { id: account.id },
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

  console.log(JSON.stringify({
    accountId: account.id,
    label: account.label,
    result,
    persisted: {
      remoteTier: updated.remoteTier,
      remoteActive: updated.remoteActive,
      remoteUnlimitedImageGeneration: updated.remoteUnlimitedImageGeneration,
      remoteAnlasBalance: updated.remoteAnlasBalance,
      remoteFixedTrainingStepsLeft: updated.remoteFixedTrainingStepsLeft,
      remotePurchasedTrainingSteps: updated.remotePurchasedTrainingSteps,
    },
  }, null, 2));
} finally {
  clearTimeout(timeout);
  await prisma.$disconnect();
}
