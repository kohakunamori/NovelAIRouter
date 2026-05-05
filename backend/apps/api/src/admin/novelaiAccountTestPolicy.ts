import type { TestNovelAiAccountRequest } from "@novelai-router/shared";
import { badRequest } from "../errors.js";

export type NovelAiAccountTestPolicyConfig = {
  healthChecksEnabled: boolean;
  smokeTestsEnabled: boolean;
};

export function assertNovelAiAccountTestModeAllowed(
  request: TestNovelAiAccountRequest,
  config: NovelAiAccountTestPolicyConfig,
) {
  if (request.mode === "health_check") {
    return;
  }

  if (!config.smokeTestsEnabled) {
    throw badRequest("SMOKE_TESTS_DISABLED", "NovelAI smoke tests are disabled by server configuration");
  }
}
