import { describe, expect, it } from "vitest";
import { estimateGenerationAnlas } from "./anlasEstimator.js";
import { generationDefaults } from "./generation.js";

describe("estimateGenerationAnlas", () => {
  it("returns zero for the small single-image baseline", () => {
    const estimate = estimateGenerationAnlas({
      ...generationDefaults,
      prompt: "test prompt",
      model: "nai-diffusion-4-5-curated",
      width: 832,
      height: 1216,
      steps: 28,
      imageCount: 1,
    });

    expect(estimate.estimatedAnlas).toBe(0);
    expect(estimate.breakdown.zeroCostEligible).toBe(true);
  });

  it("makes the first image free for zero-cost baseline batches", () => {
    const double = estimateGenerationAnlas({
      ...generationDefaults,
      prompt: "test prompt",
      model: "nai-diffusion-4-5-curated",
      width: 832,
      height: 1216,
      steps: 28,
      imageCount: 2,
    });
    const triple = estimateGenerationAnlas({
      ...generationDefaults,
      prompt: "test prompt",
      model: "nai-diffusion-4-5-curated",
      width: 832,
      height: 1216,
      steps: 28,
      imageCount: 3,
    });

    expect(double.estimatedAnlas).toBe(20);
    expect(triple.estimatedAnlas).toBe(40);
    expect(double.breakdown.zeroCostEligible).toBe(true);
    expect(triple.breakdown.zeroCostEligible).toBe(true);
  });

  it("tracks step and image-count scaling beyond the zero-cost baseline", () => {
    const single = estimateGenerationAnlas({
      ...generationDefaults,
      prompt: "test prompt",
      model: "nai-diffusion-4-5-curated",
      width: 832,
      height: 1216,
      steps: 29,
      imageCount: 1,
    });
    const doubled = estimateGenerationAnlas({
      ...generationDefaults,
      prompt: "test prompt",
      model: "nai-diffusion-4-5-curated",
      width: 832,
      height: 1216,
      steps: 40,
      imageCount: 2,
    });

    expect(single.estimatedAnlas).toBeGreaterThan(0);
    expect(doubled.estimatedAnlas).toBeGreaterThan(single.estimatedAnlas);
  });

  it("adds feature surcharges for image-guided workflows", () => {
    const plain = estimateGenerationAnlas({
      ...generationDefaults,
      prompt: "test prompt",
      model: "nai-diffusion-4-5-curated",
      steps: 29,
    });
    const advanced = estimateGenerationAnlas({
      ...generationDefaults,
      prompt: "test prompt",
      model: "nai-diffusion-4-5-full",
      steps: 29,
      baseImage: { strength: 0.8, enabled: true },
      vibeTransfers: [],
      preciseReferences: [{ prompt: "armor", strength: 0.6, secondaryStrength: 0.4, fidelity: 0.6, kind: "character_style", informationExtracted: true, enabled: true }],
    });

    expect(advanced.estimatedAnlas).toBeGreaterThan(plain.estimatedAnlas);
  });
});
