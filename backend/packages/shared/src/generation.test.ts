import { describe, expect, it } from "vitest";
import {
  generationRequestSchema,
  novelAiRequestSchema,
  novelAiRequestToGenerationRequest,
  normalizeGenerationRequest,
  supportedNovelAiRequestSchema,
  supportedNovelAiRequestToGenerationRequest,
} from "./generation.js";

describe("generation request normalization", () => {
  it("keeps legacy generate submissions compatible without an explicit operation", () => {
    const normalized = normalizeGenerationRequest(generationRequestSchema.parse({
      prompt: "test prompt",
      width: 832,
      height: 1216,
    }));

    expect(normalized.operation).toEqual({ kind: "generate" });
    expect(normalized.imageCount).toBe(1);
  });

  it("applies enhance defaults while allowing broader protocol-compatible numeric values", () => {
    const normalized = normalizeGenerationRequest(generationRequestSchema.parse({
      operation: {
        kind: "enhance",
        sourceAssetId: "asset-1",
      },
    }));

    expect(normalized.imageCount).toBe(1);
    expect(normalized.operation).toEqual({
      kind: "enhance",
      sourceAssetId: "asset-1",
      upscaleAmount: 1.5,
      magnitude: 2,
      strength: 0.5,
      noise: 0,
    });

    const widened = generationRequestSchema.parse({
      operation: {
        kind: "enhance",
        sourceAssetId: null,
        upscaleAmount: 2,
      },
    });
    expect(widened.operation).toMatchObject({
      kind: "enhance",
      sourceAssetId: null,
      upscaleAmount: 2,
    });
  });

  it("defaults upscale requests to x4 while allowing x2 requests", () => {
    const normalized = normalizeGenerationRequest(generationRequestSchema.parse({
      operation: {
        kind: "upscale",
        sourceAssetId: "asset-1",
      },
    }));

    expect(normalized.imageCount).toBe(1);
    expect(normalized.operation).toEqual({
      kind: "upscale",
      sourceAssetId: "asset-1",
      factor: 4,
    });

    const widened = generationRequestSchema.parse({
      operation: {
        kind: "upscale",
        sourceAssetId: null,
        factor: 2,
      },
    });
    expect(widened.operation).toMatchObject({
      kind: "upscale",
      sourceAssetId: null,
      factor: 2,
    });
  });

  it("maps a NovelAI wire request onto internal generation parameters", () => {
    const converted = novelAiRequestToGenerationRequest(novelAiRequestSchema.parse({
      input: "1girl",
      model: "nai-diffusion-4-5-curated",
      action: "img2img",
      parameters: {
        width: 832,
        height: 1216,
        steps: 28,
        scale: 5,
        sampler: "k_euler",
        n_samples: 3,
        qualityToggle: true,
        ucPreset: 0,
        seed: 123,
        negative_prompt: "bad anatomy",
        image: "base64-source",
        strength: 0.8,
        noise: 0.1,
        extra_noise_seed: 122,
        color_correct: false,
        reference_image_multiple: ["base64-vibe"],
        reference_strength_multiple: [0.6],
        director_reference_images: ["base64-ref"],
        director_reference_descriptions: [{ caption: { base_caption: "armor" } }],
        director_reference_strength_values: [1],
        director_reference_secondary_strength_values: [0],
      },
    }));

    expect(converted.prompt).toBe("1girl");
    expect(converted.negativePrompt).toBe("bad anatomy");
    expect(converted.imageCount).toBe(3);
    expect(converted.operation).toMatchObject({
      kind: "variations",
      sourceAssetId: null,
      strength: 0.8,
      noise: 0.1,
      extraNoiseSeed: 122,
    });
    expect(converted.vibeTransfers).toEqual([
      { strength: 0.6, informationExtracted: true, enabled: true },
    ]);
    expect(converted.preciseReferences).toEqual([
      {
        prompt: "armor",
        strength: 1,
        secondaryStrength: 0,
        fidelity: 1,
        kind: "character_style",
        informationExtracted: true,
        enabled: true,
      },
    ]);
    expect(converted.providerParameters?.image).toBe("base64-source");
  });

  it("rejects unknown keys in managed NovelAI wire requests", () => {
    const parsed = supportedNovelAiRequestSchema.safeParse({
      input: "animal",
      model: "nai-diffusion-4-5-curated",
      action: "generate",
      parameters: {
        width: 832,
        unsupported_flag: true,
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts verified x4 upscale payloads through the managed wire contract", () => {
    const converted = supportedNovelAiRequestToGenerationRequest(supportedNovelAiRequestSchema.parse({
      input: "",
      model: "nai-diffusion-4-5-curated",
      action: "img2img",
      parameters: {
        image: "base64-source",
        upscale_factor: 4,
      },
    }));

    expect(converted.operation).toEqual({
      kind: "upscale",
      sourceAssetId: null,
      factor: 4,
    });
  });

  it("accepts verified x2 upscale payloads through the managed wire contract", () => {
    const converted = supportedNovelAiRequestToGenerationRequest(supportedNovelAiRequestSchema.parse({
      input: "",
      model: "nai-diffusion-4-5-curated",
      action: "img2img",
      parameters: {
        image: "base64-source",
        upscale_factor: 2,
      },
    }));

    expect(converted.operation).toEqual({
      kind: "upscale",
      sourceAssetId: null,
      factor: 2,
    });
  });

  it("rejects unverified img2img payload shapes in the managed wire contract", () => {
    expect(() => supportedNovelAiRequestToGenerationRequest(supportedNovelAiRequestSchema.parse({
      input: "",
      model: "nai-diffusion-4-5-curated",
      action: "img2img",
      parameters: {
        image: "base64-source",
        strength: 0.8,
      },
    }))).toThrow("Only verified variations, enhance, and x4 upscale img2img payloads are supported");
  });
});
