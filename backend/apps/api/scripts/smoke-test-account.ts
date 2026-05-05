import { prisma } from "../src/db.js";
import { acquireNovelAiAccountLeaseById } from "../src/novelai/accountPool.js";
import { RealNovelAiProvider } from "../src/novelai/realNovelAiProvider.js";

const requestedAccountId = process.argv[2] ?? null;
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 60_000);
let lease: Awaited<ReturnType<typeof acquireNovelAiAccountLeaseById>> | undefined;

try {
  const account = await prisma.novelAiAccount.findFirst({
    where: requestedAccountId ? { id: requestedAccountId } : { status: "ACTIVE" },
    orderBy: { priority: "asc" },
  });

  if (!account) {
    throw new Error(requestedAccountId ? `NovelAI account ${requestedAccountId} not found` : "No active NovelAI account found");
  }

  lease = await acquireNovelAiAccountLeaseById(account.id, `script-smoke-${Date.now()}`);
  const provider = new RealNovelAiProvider();
  const result = await provider.smokeTestAccount({
    accountId: account.id,
    credential: lease.credential as never,
    signal: controller.signal,
  });

  await lease.markSuccess();
  console.log(JSON.stringify({
    accountId: account.id,
    label: account.label,
    result,
  }, null, 2));
} catch (error) {
  await lease?.markFailure(error);
  throw error;
} finally {
  clearTimeout(timeout);
  await lease?.release();
  await prisma.$disconnect();
}
