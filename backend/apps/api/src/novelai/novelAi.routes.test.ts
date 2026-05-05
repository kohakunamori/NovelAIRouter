import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../errors.js";
import { NovelAiProviderError } from "./providerErrors.js";

const provider = {
  generate: vi.fn(),
  suggestTags: vi.fn(),
  dryRunAccountTest: vi.fn(),
  healthCheckAccount: vi.fn(),
  smokeTestAccount: vi.fn(),
};

const acquireNovelAiAccountLease = vi.fn();

vi.mock("./providerFactory.js", () => ({
  createNovelAiProvider: () => provider,
}));

vi.mock("./accountPool.js", () => ({
  acquireNovelAiAccountLease: (...args: unknown[]) => acquireNovelAiAccountLease(...args),
}));

describe("novelAiRoutes suggest-tags", () => {
  beforeEach(() => {
    provider.generate.mockReset();
    provider.suggestTags.mockReset();
    provider.dryRunAccountTest.mockReset();
    provider.healthCheckAccount.mockReset();
    provider.smokeTestAccount.mockReset();
    acquireNovelAiAccountLease.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves suggest-tags anonymously when upstream accepts anonymous access", async () => {
    const app = await buildTestApp();
    provider.suggestTags.mockResolvedValue({
      tags: [{ tag: "animal", count: 10000, confidence: 0 }],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/novelai/suggest-tags?model=nai-diffusion-4-5-curated&prompt=animal",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      tags: [{ tag: "animal", count: 10000, confidence: 0 }],
    });
    expect(provider.suggestTags).toHaveBeenCalledTimes(1);
    expect(provider.suggestTags).toHaveBeenCalledWith({
      model: "nai-diffusion-4-5-curated",
      prompt: "animal",
      signal: expect.any(AbortSignal),
    });
    expect(acquireNovelAiAccountLease).not.toHaveBeenCalled();

    await app.close();
  });

  it("falls back to a leased credential when anonymous upstream access is rejected", async () => {
    const app = await buildTestApp();
    const lease = {
      accountId: "account-1",
      credential: { token: "secret-token" },
      markSuccess: vi.fn().mockResolvedValue(undefined),
      markFailure: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };

    provider.suggestTags
      .mockRejectedValueOnce(new NovelAiProviderError("PROVIDER_AUTH_FAILED", "NovelAI credential was rejected", false))
      .mockResolvedValueOnce({
        tags: [{ tag: "animal", count: 10000, confidence: 0 }],
      });
    acquireNovelAiAccountLease.mockResolvedValue(lease);

    const response = await app.inject({
      method: "GET",
      url: "/api/novelai/suggest-tags?model=nai-diffusion-4-5-curated&prompt=animal",
    });

    expect(response.statusCode).toBe(200);
    expect(provider.suggestTags).toHaveBeenCalledTimes(2);
    expect(provider.suggestTags).toHaveBeenNthCalledWith(1, {
      model: "nai-diffusion-4-5-curated",
      prompt: "animal",
      signal: expect.any(AbortSignal),
    });
    expect(provider.suggestTags).toHaveBeenNthCalledWith(2, {
      model: "nai-diffusion-4-5-curated",
      prompt: "animal",
      signal: expect.any(AbortSignal),
      accountId: "account-1",
      credential: { token: "secret-token" },
    });
    expect(acquireNovelAiAccountLease).toHaveBeenCalledTimes(1);
    expect(lease.markSuccess).toHaveBeenCalledTimes(1);
    expect(lease.markFailure).not.toHaveBeenCalled();
    expect(lease.release).toHaveBeenCalledTimes(1);

    await app.close();
  });
});

async function buildTestApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  const { novelAiRoutes } = await import("./novelAi.routes.js");
  await app.register(novelAiRoutes);
  return app;
}
