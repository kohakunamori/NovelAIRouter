import { describe, expect, it } from "vitest";
import { getNovelAiReadiness } from "./readiness.js";

describe("getNovelAiReadiness", () => {
  it("reports blockers for incomplete production readiness", () => {
    expect(getNovelAiReadiness({
      activeAccountCount: 0,
    })).toEqual({
      readyForRealGeneration: false,
      blockers: [
        'No active NovelAI account is available in the pool',
      ],
    });
  });

  it("reports credential recovery blockers when configured accounts cannot decrypt", () => {
    expect(getNovelAiReadiness({
      activeAccountCount: 0,
      configuredAccountCount: 2,
      credentialErrorAccountCount: 2,
    })).toEqual({
      readyForRealGeneration: false,
      blockers: [
        "Configured NovelAI accounts exist, but their credentials cannot be decrypted. Restore the previous credential encryption key or rotate the account credentials.",
      ],
    });
  });

  it("marks production ready when required inputs are present", () => {
    expect(getNovelAiReadiness({
      activeAccountCount: 1,
    })).toEqual({ readyForRealGeneration: true, blockers: [] });
  });
});
