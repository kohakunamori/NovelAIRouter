import { describe, expect, it } from "vitest";
import { AppError } from "../errors.js";
import { assertNovelAiAccountTestModeAllowed } from "./novelaiAccountTestPolicy.js";

const baseConfig = {
  healthChecksEnabled: false,
  smokeTestsEnabled: false,
};

describe("assertNovelAiAccountTestModeAllowed", () => {
  it("allows health-check regardless of healthChecksEnabled", () => {
    expect(() =>
      assertNovelAiAccountTestModeAllowed(
        { mode: "health_check", acknowledgeNetwork: true },
        baseConfig,
      ),
    ).not.toThrow();
  });

  it("allows health-check when health checks are enabled", () => {
    expect(() =>
      assertNovelAiAccountTestModeAllowed(
        { mode: "health_check", acknowledgeNetwork: true },
        { ...baseConfig, healthChecksEnabled: true },
      ),
    ).not.toThrow();
  });

  it("blocks smoke-test when server-side smoke tests are disabled", () => {
    expect(() =>
      assertNovelAiAccountTestModeAllowed(
        {
          mode: "smoke_test",
          acknowledgeNetwork: true,
          acknowledgeAnlasSpend: true,
          confirmationText: "SPEND_ANLAS",
        },
        baseConfig,
      ),
    ).toThrow(/smoke tests are disabled/i);
  });

  it("allows smoke-test when server-side smoke tests are enabled", () => {
    expect(() =>
      assertNovelAiAccountTestModeAllowed(
        {
          mode: "smoke_test",
          acknowledgeNetwork: true,
          acknowledgeAnlasSpend: true,
          confirmationText: "SPEND_ANLAS",
        },
        { ...baseConfig, smokeTestsEnabled: true },
      ),
    ).not.toThrow();
  });
});
