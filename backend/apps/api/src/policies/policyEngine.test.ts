import { describe, expect, it } from "vitest";
import type { PolicyRecord } from "@novelai-router/shared";
import { applyParameterPolicies } from "./policyEngine.js";

const basePolicy: PolicyRecord = {
  id: "policy-1",
  name: "Global",
  scope: "GLOBAL",
  role: null,
  userId: null,
  priority: 0,
  enabled: true,
  version: 1,
  rules: [
    { id: "default-model", action: "default", field: "model", value: "nai-diffusion-4-5-curated" },
    { id: "default-width", action: "default", field: "width", value: 1024 },
    { id: "default-height", action: "default", field: "height", value: 1024 },
    { id: "default-steps", action: "default", field: "steps", value: 28 },
    { id: "default-scale", action: "default", field: "scale", value: 5 },
    { id: "default-sampler", action: "default", field: "sampler", value: "k_euler_ancestral" },
    { id: "limit-width", action: "clamp", field: "width", min: 512, max: 1536 },
    { id: "limit-steps", action: "clamp", field: "steps", min: 1, max: 40 },
  ],
};

describe("applyParameterPolicies", () => {
  it("applies defaults and clamps numeric fields", () => {
    const decision = applyParameterPolicies(
      { prompt: "test", width: 2048, steps: 99 },
      [basePolicy],
      { userId: "user-1", role: "USER" },
    );

    expect(decision.accepted).toBe(true);
    expect(decision.normalizedParams?.width).toBe(1536);
    expect(decision.normalizedParams?.steps).toBe(40);
    expect(decision.normalizedParams?.height).toBe(1024);
    expect(decision.appliedRules.map((rule) => rule.ruleId)).toContain("limit-width");
  });

  it("forces admin-defined values", () => {
    const policy: PolicyRecord = {
      ...basePolicy,
      rules: [...basePolicy.rules, { id: "force-model", action: "force", field: "model", value: "nai-diffusion-3" }],
    };

    const decision = applyParameterPolicies(
      { prompt: "test", model: "nai-diffusion-4-full" },
      [policy],
      { userId: "user-1", role: "USER" },
    );

    expect(decision.accepted).toBe(true);
    expect(decision.normalizedParams?.model).toBe("nai-diffusion-3");
  });

  it("rejects denied values", () => {
    const policy: PolicyRecord = {
      ...basePolicy,
      rules: [...basePolicy.rules, { id: "deny-ddim", action: "denyValues", field: "sampler", values: ["ddim"] }],
    };

    const decision = applyParameterPolicies(
      { prompt: "test", sampler: "ddim" },
      [policy],
      { userId: "user-1", role: "USER" },
    );

    expect(decision.accepted).toBe(false);
    expect(decision.violations[0]?.code).toBe("VALUE_DENIED");
  });

  it("supports nested policy fields", () => {
    const policy: PolicyRecord = {
      ...basePolicy,
      rules: [
        ...basePolicy.rules,
        { id: "disable-quality-toggle", action: "force", field: "promptOptions.qualityToggle", value: false },
      ],
    };

    const decision = applyParameterPolicies(
      { prompt: "test", promptOptions: { qualityToggle: true } },
      [policy],
      { userId: "user-1", role: "USER" },
    );

    expect(decision.accepted).toBe(true);
    expect(decision.normalizedParams?.promptOptions.qualityToggle).toBe(false);
  });

  it("supports nested array policy fields for reference workflows", () => {
    const policy: PolicyRecord = {
      ...basePolicy,
      rules: [
        ...basePolicy.rules,
        { id: "force-vibe-strength", action: "force", field: "vibeTransfers.0.strength", value: 1.1 },
      ],
    };

    const decision = applyParameterPolicies(
      {
        prompt: "test",
        vibeTransfers: [{ strength: 0.2, informationExtracted: true, enabled: true }],
      },
      [policy],
      { userId: "user-1", role: "USER" },
    );

    expect(decision.accepted).toBe(true);
    expect(decision.normalizedParams?.vibeTransfers[0]?.informationExtracted).toBe(true);
    expect(decision.normalizedParams?.vibeTransfers[0]?.strength).toBe(1.1);
  });
});
