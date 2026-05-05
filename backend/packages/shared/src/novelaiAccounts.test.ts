import { describe, expect, it } from "vitest";
import { testNovelAiAccountRequestSchema } from "./novelaiAccounts.js";

describe("testNovelAiAccountRequestSchema", () => {
  it("rejects health-check without network acknowledgement", () => {
    expect(() => testNovelAiAccountRequestSchema.parse({ mode: "health_check" })).toThrow();
  });

  it("rejects smoke-test without explicit Anlas confirmation", () => {
    expect(() =>
      testNovelAiAccountRequestSchema.parse({
        mode: "smoke_test",
        acknowledgeNetwork: true,
        acknowledgeAnlasSpend: true,
        confirmationText: "wrong",
      }),
    ).toThrow();
  });
});
