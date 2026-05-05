import { describe, expect, it } from "vitest";
import { calculateBilledPlatformUnits } from "./billing.js";

describe("calculateBilledPlatformUnits", () => {
  it("rounds actual NovelAI Anlas multiplied by the platform multiplier upward", () => {
    expect(calculateBilledPlatformUnits(12, 1.5)).toBe(18);
    expect(calculateBilledPlatformUnits(5, 1.25)).toBe(7);
  });
});
