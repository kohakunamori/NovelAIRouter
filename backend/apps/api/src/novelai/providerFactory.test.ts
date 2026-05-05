import { afterEach, describe, expect, it, vi } from "vitest";

const baseEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
};

describe("providerFactory", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("creates the real provider", async () => {
    stubEnv({});
    const [{ createNovelAiProvider }, { RealNovelAiProvider }] = await Promise.all([
      import("./providerFactory.js"),
      import("./realNovelAiProvider.js"),
    ]);

    expect(createNovelAiProvider()).toBeInstanceOf(RealNovelAiProvider);
  });
});

function stubEnv(overrides: Record<string, string>) {
  for (const [key, value] of Object.entries({ ...baseEnv, ...overrides })) {
    vi.stubEnv(key, value);
  }
}
