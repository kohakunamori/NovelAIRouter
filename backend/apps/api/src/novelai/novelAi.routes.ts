import type { FastifyInstance } from "fastify";
import { novelAiBalanceResponseSchema, suggestTagsQuerySchema, suggestTagsResponseSchema } from "@novelai-router/shared";
import { prisma } from "../db.js";
import { acquireNovelAiAccountLease, type NovelAiAccountLease } from "./accountPool.js";
import type { NovelAiProvider } from "./NovelAiProvider.js";
import { createNovelAiProvider } from "./providerFactory.js";
import { NovelAiProviderError } from "./providerErrors.js";

function shouldRetrySuggestTagsWithCredential(error: unknown) {
  return error instanceof NovelAiProviderError && error.code === "PROVIDER_AUTH_FAILED";
}

export async function novelAiRoutes(app: FastifyInstance) {
  const provider: NovelAiProvider = createNovelAiProvider();

  app.get("/api/novelai/balance", async () => {
    const accounts = await prisma.novelAiAccount.findMany({
      where: { status: "ACTIVE" },
      select: { remoteAnlasBalance: true },
    });
    const balances = accounts
      .map((account) => account.remoteAnlasBalance)
      .filter((balance): balance is number => typeof balance === "number");

    return novelAiBalanceResponseSchema.parse({
      anlas: balances.length > 0 ? balances.reduce((sum, balance) => sum + balance, 0) : 0,
    });
  });

  app.get("/api/novelai/suggest-tags", async (request) => {
    const query = suggestTagsQuerySchema.parse(request.query);
    const abortController = new AbortController();
    const handleClose = () => abortController.abort();
    request.raw.once("close", handleClose);

    let lease: NovelAiAccountLease | undefined;
    try {
      try {
        const result = await provider.suggestTags({
          model: query.model,
          prompt: query.prompt,
          signal: abortController.signal,
        });

        return suggestTagsResponseSchema.parse(result);
      } catch (error) {
        if (!shouldRetrySuggestTagsWithCredential(error)) {
          throw error;
        }
      }

      lease = await acquireNovelAiAccountLease(`suggest-tags:fallback:${request.id}`);

      const result = await provider.suggestTags({
        model: query.model,
        prompt: query.prompt,
        signal: abortController.signal,
        accountId: lease.accountId,
        credential: lease.credential,
      });

      await lease.markSuccess();
      return suggestTagsResponseSchema.parse(result);
    } catch (error) {
      await lease?.markFailure(error);
      throw error;
    } finally {
      request.raw.off("close", handleClose);
      await lease?.release();
    }
  });
}
