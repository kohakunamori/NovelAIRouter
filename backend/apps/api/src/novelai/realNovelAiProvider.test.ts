import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pack } from "msgpackr";

const baseEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
};

function frame(value: unknown) {
  const payload = pack(value);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2iQAAAAASUVORK5CYII=", "base64");

function createStoredZip(entries: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileName = Buffer.from(entry.name, "utf8");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, fileName, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, fileName);

    offset += localHeader.length + fileName.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

async function createPng(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).png().toBuffer();
}

function createBaseParams() {
  return {
    prompt: "test",
    negativePrompt: "",
    model: "nai-diffusion-4-5-curated" as const,
    width: 832,
    height: 1216,
    steps: 28,
    scale: 5,
    sampler: "k_euler_ancestral" as const,
    seed: 0,
    imageCount: 1,
    promptOptions: {
      qualityToggle: true,
      ucPreset: 0,
    },
    referenceOptions: {
      normalizeStrengthValues: true,
    },
    baseImage: null,
    characterPrompts: [],
    vibeTransfers: [],
    preciseReferences: [],
    providerParameters: {},
    providerEnvelope: {
      useNewSharedTrial: null,
      recaptchaToken: null,
    },
    operation: { kind: "generate" as const },
  };
}

describe("RealNovelAiProvider account tests", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(fileURLToPath(new URL("../../.data/storage/system", import.meta.url)), { recursive: true, force: true });
  });

  it("dry-run does not call the network transport", async () => {
    stubEnv({ NOVELAI_GENERATE_URL: "https://image.novelai.net/ai/generate-image-stream" });
    const { RealNovelAiProvider } = await import("./realNovelAiProvider.js");
    const transport = vi.fn();
    const provider = new RealNovelAiProvider(transport as never);

    const result = await provider.dryRunAccountTest({
      accountId: "account-1",
      credential: { token: "secret-token" },
      signal: new AbortController().signal,
    });

    expect(transport).not.toHaveBeenCalled();
    expect(result.safety).toEqual({
      networkUsed: false,
      credentialSent: false,
      mayConsumeAnlas: false,
      anlasConsumed: null,
    });
  });

  it("refuses health checks without a configured health URL", async () => {
    const [{ updateRuntimeConfig }, { RealNovelAiProvider }] = await Promise.all([
      import("../runtimeConfig.js"),
      import("./realNovelAiProvider.js"),
    ]);
    updateRuntimeConfig({ novelAiHealthCheckUrl: null });
    const provider = new RealNovelAiProvider(async () => new Response(null, { status: 401 }) as never);

    await expect(
      provider.healthCheckAccount({
        accountId: "account-1",
        credential: { token: "secret-token" },
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "REAL_PROVIDER_NOT_CONFIGURED" });
  });

  it("preserves zero Anlas balances from health check responses", async () => {
    const { RealNovelAiProvider } = await import("./realNovelAiProvider.js");
    const provider = new RealNovelAiProvider(async () => new Response(JSON.stringify({
      accountType: 1,
      trainingStepsLeft: {
        fixedTrainingStepsLeft: 0,
        purchasedTrainingSteps: 0,
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }) as never);

    const result = await provider.healthCheckAccount({
      accountId: "account-1",
      credential: { token: "secret-token" },
      signal: new AbortController().signal,
    });

    expect(result.remote).toMatchObject({
      accountLabel: null,
      anlasBalance: 0,
      fixedTrainingStepsLeft: 0,
      purchasedTrainingSteps: 0,
    });
  });

  it("fetches suggest-tags without requiring a credential", async () => {
    stubEnv({ NOVELAI_SUGGEST_TAGS_URL: "https://image.novelai.net/ai/generate-image/suggest-tags" });
    const { RealNovelAiProvider } = await import("./realNovelAiProvider.js");
    const transport = vi.fn(async () => new Response(JSON.stringify({
      tags: [
        { tag: "animal", count: 10000, confidence: 0 },
        { tag: "dog", count: 10000, confidence: 0.8154296875 },
      ],
    }), {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }) as never);
    const provider = new RealNovelAiProvider(transport as never);

    const result = await provider.suggestTags({
      model: "nai-diffusion-4-5-curated",
      prompt: "animal",
      signal: new AbortController().signal,
    });

    expect(result.tags).toEqual([
      { tag: "animal", count: 10000, confidence: 0 },
      { tag: "dog", count: 10000, confidence: 0.8154296875 },
    ]);
    expect(transport).toHaveBeenCalledWith(
      "https://image.novelai.net/ai/generate-image/suggest-tags?model=nai-diffusion-4-5-curated&prompt=animal",
      expect.objectContaining({
        method: "GET",
        headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
      }),
    );
  });

  it("decodes final image bytes from msgpack generation responses", async () => {
    stubEnv({
      NOVELAI_GENERATE_URL: "https://image.novelai.net/ai/generate-image-stream",
      NOVELAI_GENERATE_RESPONSE_FORMAT: "msgpack_stream",
      NOVELAI_GENERATE_ANLAS_SOURCE: "subscription_delta",
    });
    const { RealNovelAiProvider } = await import("./realNovelAiProvider.js");
    const msgpackBody = Buffer.concat([
      frame({ event_type: "intermediate", step_ix: 1, total_steps: 2, image: Buffer.from("preview") }),
      frame({ event_type: "final", image: Buffer.from("final-image") }),
    ]);
    const transport = vi.fn(async () => new Response(msgpackBody, { status: 200, headers: { "content-type": "application/msgpack" } }) as never);
    const provider = new RealNovelAiProvider(transport as never);

    const result = await provider.generate({
      jobId: "job-1",
      params: {
        ...createBaseParams(),
        model: "nai-diffusion-4-curated-preview",
        width: 1024,
        height: 1024,
      },
      resolvedAssets: {
        sourceImage: null,
        baseImage: null,
        vibeTransfers: [],
        preciseReferences: [],
      },
      signal: new AbortController().signal,
      accountId: "account-1",
      credential: { token: "secret-token" },
    });

    expect(result.images.map((image) => image.toString())).toEqual(["final-image"]);
    expect(result.actualNovelAiAnlas).toBeNull();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("serializes encode-vibe binaries into cached multipart request parts", async () => {
    stubEnv({
      NOVELAI_GENERATE_URL: "https://image.novelai.net/ai/generate-image-stream",
      NOVELAI_GENERATE_RESPONSE_FORMAT: "msgpack_stream",
      NOVELAI_GENERATE_ANLAS_SOURCE: "subscription_delta",
    });
    const { RealNovelAiProvider } = await import("./realNovelAiProvider.js");
    const vibeBinary = Buffer.from([0x1a, 0x7a, 0x0f, 0xe9]);
    const msgpackBody = Buffer.concat([frame({ event_type: "final", image: Buffer.from("final-image") })]);
    const transport = vi.fn()
      .mockResolvedValueOnce(new Response(vibeBinary, { status: 200, headers: { "content-type": "application/binary" } }) as never)
      .mockResolvedValueOnce(new Response(msgpackBody, { status: 200, headers: { "content-type": "application/msgpack" } }) as never);
    const provider = new RealNovelAiProvider(transport as never);

    await provider.generate({
      jobId: "job-vibe",
      params: {
        ...createBaseParams(),
        vibeTransfers: [{ strength: 0.65, informationExtracted: true, enabled: true }],
      },
      resolvedAssets: {
        sourceImage: null,
        baseImage: null,
        vibeTransfers: [{ mimeType: "image/png", originalFilename: "vibe.png", buffer: onePixelPng, strength: 0.65, informationExtracted: true }],
        preciseReferences: [],
      },
      signal: new AbortController().signal,
      accountId: "account-1",
      credential: { token: "secret-token" },
    });

    const body = transport.mock.calls[1]?.[1]?.body as FormData;
    const requestPart = body.get("request");
    expect(requestPart).toBeInstanceOf(Blob);
    const request = JSON.parse(await (requestPart as Blob).text()) as {
      parameters: { reference_image_multiple_cached: Array<{ cache_secret_key: string; data: string }> };
    };
    expect(request.parameters.reference_image_multiple_cached).toHaveLength(1);
    expect(request.parameters.reference_image_multiple_cached[0]?.data).toBe("ref_multiple_0");
    expect(request.parameters.reference_image_multiple_cached[0]?.cache_secret_key).toMatch(/^[a-f0-9]{64}$/);

    const vibePart = body.get("ref_multiple_0");
    expect(vibePart).toBeInstanceOf(Blob);
    expect((vibePart as Blob).type).toBe("application/octet-stream");
    expect(Buffer.from(await (vibePart as Blob).arrayBuffer())).toEqual(vibeBinary);
  });

  it("routes variations through an img2img payload with a source image field", async () => {
    stubEnv({
      NOVELAI_GENERATE_URL: "https://image.novelai.net/ai/generate-image-stream",
      NOVELAI_GENERATE_RESPONSE_FORMAT: "msgpack_stream",
      NOVELAI_GENERATE_ANLAS_SOURCE: "subscription_delta",
    });
    const { RealNovelAiProvider } = await import("./realNovelAiProvider.js");
    const msgpackBody = Buffer.concat([frame({ event_type: "final", image: Buffer.from("variation-image") })]);
    const transport = vi.fn(async () => new Response(msgpackBody, { status: 200, headers: { "content-type": "application/msgpack" } }) as never);
    const provider = new RealNovelAiProvider(transport as never);

    await provider.generate({
      jobId: "job-variation",
      params: {
        ...createBaseParams(),
        imageCount: 3,
        operation: {
          kind: "variations",
          sourceAssetId: "asset-1",
          strength: 0.8,
          noise: 0.1,
          addOriginalImage: true,
          colorCorrect: false,
          extraNoiseSeed: 123,
          imageCacheSecretKey: null,
        },
      },
      resolvedAssets: {
        sourceImage: { mimeType: "image/png", originalFilename: "source.png", buffer: onePixelPng },
        baseImage: null,
        vibeTransfers: [],
        preciseReferences: [],
      },
      signal: new AbortController().signal,
      accountId: "account-1",
      credential: { token: "secret-token" },
    });

    const requestInit = (transport.mock.calls[0] as unknown as [string, { body: FormData }])[1];
    const body = requestInit.body;
    const requestPart = body.get("request");
    expect(requestPart).toBeInstanceOf(Blob);
    const request = JSON.parse(await (requestPart as Blob).text()) as {
      action: string;
      parameters: { image: string; strength: number; noise: number; n_samples: number };
    };
    expect(request.action).toBe("img2img");
    expect(request.parameters.image).toBe("source-image");
    expect(request.parameters.strength).toBe(0.8);
    expect(request.parameters.noise).toBe(0.1);
    expect(request.parameters.n_samples).toBe(3);

    const sourcePart = body.get("source-image");
    expect(sourcePart).toBeInstanceOf(Blob);
    expect((sourcePart as Blob).type).toBe("image/png");
  });

  it("passes through raw official-style img2img parameters without requiring local assets", async () => {
    stubEnv({
      NOVELAI_GENERATE_URL: "https://image.novelai.net/ai/generate-image-stream",
      NOVELAI_GENERATE_RESPONSE_FORMAT: "msgpack_stream",
      NOVELAI_GENERATE_ANLAS_SOURCE: "subscription_delta",
    });
    const { RealNovelAiProvider } = await import("./realNovelAiProvider.js");
    const msgpackBody = Buffer.concat([frame({ event_type: "final", image: Buffer.from("raw-img2img") })]);
    const transport = vi.fn(async () => new Response(msgpackBody, { status: 200, headers: { "content-type": "application/msgpack" } }) as never);
    const provider = new RealNovelAiProvider(transport as never);

    await provider.generate({
      jobId: "job-raw-img2img",
      params: {
        ...createBaseParams(),
        prompt: "1girl",
        negativePrompt: "bad anatomy",
        sampler: "k_euler",
        providerParameters: {
          image: "base64-source-image",
          mask: "base64-mask",
          reference_image_multiple: ["base64-vibe"],
          reference_information_extracted_multiple: [1],
          skip_cfg_above_sigma: 58,
          use_coords: false,
          image_format: "png",
        },
        operation: {
          kind: "variations",
          sourceAssetId: null,
          strength: 0.8,
          noise: 0.1,
          addOriginalImage: true,
          colorCorrect: false,
          extraNoiseSeed: 123,
          imageCacheSecretKey: null,
        },
      },
      resolvedAssets: {
        sourceImage: null,
        baseImage: null,
        vibeTransfers: [],
        preciseReferences: [],
      },
      signal: new AbortController().signal,
      accountId: "account-1",
      credential: { token: "secret-token" },
    });

    const requestInit = (transport.mock.calls[0] as unknown as [string, { body: string }])[1];
    const request = JSON.parse(requestInit.body) as {
      action: string;
      parameters: {
        image: string;
        mask: string;
        reference_image_multiple: string[];
        skip_cfg_above_sigma: number;
        use_coords: boolean;
      };
    };
    expect(request.action).toBe("img2img");
    expect(request.parameters.image).toBe("base64-source-image");
    expect(request.parameters.mask).toBe("base64-mask");
    expect(request.parameters.reference_image_multiple).toEqual(["base64-vibe"]);
    expect(request.parameters.skip_cfg_above_sigma).toBe(58);
    expect(request.parameters.use_coords).toBe(false);
  });

  it("maps enhance requests with documented defaults onto a single-image img2img payload", async () => {
    stubEnv({
      NOVELAI_GENERATE_URL: "https://image.novelai.net/ai/generate-image-stream",
      NOVELAI_GENERATE_RESPONSE_FORMAT: "msgpack_stream",
      NOVELAI_GENERATE_ANLAS_SOURCE: "subscription_delta",
    });
    const { RealNovelAiProvider } = await import("./realNovelAiProvider.js");
    const msgpackBody = Buffer.concat([frame({ event_type: "final", image: Buffer.from("enhanced-image") })]);
    const transport = vi.fn(async () => new Response(msgpackBody, { status: 200, headers: { "content-type": "application/msgpack" } }) as never);
    const provider = new RealNovelAiProvider(transport as never);
    const sourcePng = await createPng(128, 128);

    await provider.generate({
      jobId: "job-enhance",
      params: {
        ...createBaseParams(),
        operation: {
          kind: "enhance",
          sourceAssetId: "asset-1",
          upscaleAmount: 1.5,
          magnitude: 2,
          strength: 0.5,
          noise: 0,
        },
      },
      resolvedAssets: {
        sourceImage: { mimeType: "image/png", originalFilename: "source.png", buffer: sourcePng },
        baseImage: null,
        vibeTransfers: [],
        preciseReferences: [],
      },
      signal: new AbortController().signal,
      accountId: "account-1",
      credential: { token: "secret-token" },
    });

    const requestInit = (transport.mock.calls[0] as unknown as [string, { body: FormData }])[1];
    const body = requestInit.body;
    const requestPart = body.get("request");
    expect(requestPart).toBeInstanceOf(Blob);
    const request = JSON.parse(await (requestPart as Blob).text()) as {
      action: string;
      parameters: { image: string; width: number; height: number; n_samples: number; upscale_amount: number; magnitude: number; strength: number; noise: number };
    };
    expect(request.action).toBe("img2img");
    expect(request.parameters.image).toBe("source-image");
    expect(request.parameters.width).toBe(192);
    expect(request.parameters.height).toBe(192);
    expect(request.parameters.n_samples).toBe(1);
    expect(request.parameters.upscale_amount).toBe(1.5);
    expect(request.parameters.magnitude).toBe(2);
    expect(request.parameters.strength).toBe(0.5);
    expect(request.parameters.noise).toBe(0);
  });

  it("routes upscale requests to the documented dedicated endpoint", async () => {
    stubEnv({
      NOVELAI_UPSCALE_URL: "https://api.novelai.net/ai/upscale",
      NOVELAI_GENERATE_ANLAS_SOURCE: "subscription_delta",
    });
    const { RealNovelAiProvider } = await import("./realNovelAiProvider.js");
    const sourcePng = await createPng(128, 128);
    const zipBody = createStoredZip([{ name: "upscaled.png", data: sourcePng }]);
    const transport = vi.fn(async () => new Response(zipBody, {
      status: 200,
      headers: { "content-type": "application/x-zip-compressed" },
    }) as never);
    const provider = new RealNovelAiProvider(transport as never);

    const result = await provider.generate({
      jobId: "job-upscale",
      params: {
        ...createBaseParams(),
        operation: {
          kind: "upscale",
          sourceAssetId: "asset-1",
          factor: 4,
        },
      },
      resolvedAssets: {
        sourceImage: { mimeType: "image/png", originalFilename: "source.png", buffer: sourcePng },
        baseImage: null,
        vibeTransfers: [],
        preciseReferences: [],
      },
      signal: new AbortController().signal,
      accountId: "account-1",
      credential: { token: "secret-token" },
    });

    expect(result.mimeType).toBe("image/png");
    expect(result.images).toEqual([sourcePng]);
    expect(transport).toHaveBeenCalledWith(
      "https://api.novelai.net/ai/upscale",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ image: sourcePng.toString("base64"), width: 128, height: 128, scale: 4 }),
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("builds cached director reference payloads with prompts preserved per resized canvas", async () => {
    stubEnv({ NOVELAI_GENERATE_URL: "https://image.novelai.net/ai/generate-image-stream" });
    const { buildGenerateFormData } = await import("./realNovelAiProvider.js");
    const portraitPng = await createPng(4, 8);
    const landscapePng = await createPng(8, 4);
    const squarePng = await createPng(5, 5);

    const form = await buildGenerateFormData(
      {
        ...createBaseParams(),
        preciseReferences: [
          { prompt: "armor", strength: 0.55, secondaryStrength: 0.35, fidelity: 0.65, kind: "character_style", informationExtracted: true, enabled: true },
          { prompt: "cape", strength: 0.65, secondaryStrength: 0.45, fidelity: 0.55, kind: "character_style", informationExtracted: false, enabled: true },
          { prompt: "gloves", strength: 0.75, secondaryStrength: 0.25, fidelity: 0.75, kind: "character_style", informationExtracted: true, enabled: true },
        ],
      },
      {
        sourceImage: null,
        baseImage: null,
        vibeTransfers: [],
        preciseReferences: [
          { mimeType: "image/png", originalFilename: "portrait.png", buffer: portraitPng, prompt: "armor", strength: 0.55, secondaryStrength: 0.35, informationExtracted: true },
          { mimeType: "image/png", originalFilename: "landscape.png", buffer: landscapePng, prompt: "cape", strength: 0.65, secondaryStrength: 0.45, informationExtracted: false },
          { mimeType: "image/png", originalFilename: "square.png", buffer: squarePng, prompt: "gloves", strength: 0.75, secondaryStrength: 0.25, informationExtracted: true },
        ],
      },
    );

    const requestPart = form.get("request");
    expect(requestPart).toBeInstanceOf(Blob);
    const request = JSON.parse(await (requestPart as Blob).text()) as {
      parameters: {
        director_reference_images_cached: Array<{ cache_secret_key: string; data: string }>;
        director_reference_descriptions: Array<{ caption: { base_caption: string } }>;
      };
    };

    expect(request.parameters.director_reference_descriptions.map((entry) => entry.caption.base_caption)).toEqual([
      "armor",
      "cape",
      "gloves",
    ]);
    expect(request.parameters.director_reference_images_cached).toHaveLength(3);
    expect(request.parameters.director_reference_images_cached.map((entry) => entry.data)).toEqual([
      "director_ref_0",
      "director_ref_1",
      "director_ref_2",
    ]);
    request.parameters.director_reference_images_cached.forEach((entry) => {
      expect(entry.cache_secret_key).toMatch(/^[a-f0-9]{64}$/);
    });

    const portraitPart = form.get("director_ref_0");
    expect(portraitPart).toBeInstanceOf(Blob);
    expect((portraitPart as Blob).type).toBe("image/png");
    await expect(sharp(Buffer.from(await (portraitPart as Blob).arrayBuffer())).metadata()).resolves.toMatchObject({
      width: 1024,
      height: 1536,
    });

    const landscapePart = form.get("director_ref_1");
    expect(landscapePart).toBeInstanceOf(Blob);
    await expect(sharp(Buffer.from(await (landscapePart as Blob).arrayBuffer())).metadata()).resolves.toMatchObject({
      width: 1536,
      height: 1024,
    });

    const squarePart = form.get("director_ref_2");
    expect(squarePart).toBeInstanceOf(Blob);
    await expect(sharp(Buffer.from(await (squarePart as Blob).arrayBuffer())).metadata()).resolves.toMatchObject({
      width: 1472,
      height: 1472,
    });
  });
});

function stubEnv(overrides: Record<string, string>) {
  for (const [key, value] of Object.entries({ ...baseEnv, ...overrides })) {
    vi.stubEnv(key, value);
  }
}
