import { Readable } from "node:stream";
import { unpack } from "msgpackr";
import type { NovelAiIntermediateFrame } from "./NovelAiProvider.js";
import { NovelAiProviderError } from "./providerErrors.js";

type MsgpackChunk = {
  event_type?: string;
  step_ix?: number;
  samp_ix?: number;
  steps?: number;
  total_steps?: number;
  sigma?: number;
  message?: string;
  error?: string;
  gen_id?: number | string;
  image?: string | Buffer | Uint8Array;
  images?: Array<string | Buffer | Uint8Array>;
};

export async function decodeNovelAiMsgpackImageStream(
  source: Readable,
  options?: {
    onProgress?: (message: string) => void;
    onIntermediateFrame?: (frame: NovelAiIntermediateFrame) => Promise<void> | void;
  },
) {
  let buffered = Buffer.alloc(0);
  const finalImages: Buffer[] = [];

  for await (const chunk of source) {
    buffered = buffered.length === 0
      ? Buffer.from(chunk)
      : Buffer.concat([buffered, Buffer.from(chunk)]);

    while (buffered.length >= 4) {
      const frameLength = buffered.readUInt32BE(0);
      if (buffered.length < frameLength + 4) break;

      const value = unpack(buffered.subarray(4, frameLength + 4)) as MsgpackChunk;
      buffered = buffered.subarray(frameLength + 4);

      if (value.event_type === "intermediate") {
        const totalStepsValue = value.total_steps ?? value.steps ?? null;
        const totalSteps = totalStepsValue && totalStepsValue > 0 ? totalStepsValue : null;
        options?.onProgress?.(`NovelAI intermediate ${value.step_ix ?? 0}/${totalSteps ?? 0}`);
        if (value.image) {
          await options?.onIntermediateFrame?.({
            outputIndex: value.samp_ix ?? 0,
            stepIndex: value.step_ix ?? 0,
            totalSteps,
            sigma: value.sigma ?? null,
            providerGenerationId: value.gen_id === undefined ? null : String(value.gen_id),
            mimeType: "image/jpeg",
            buffer: toImageBuffer(value.image),
          });
        }
        continue;
      }

      if (value.event_type === "error") {
        const message = value.message ?? value.error ?? "NovelAI returned an error frame";
        throw new NovelAiProviderError("PROVIDER_MSGPACK_ERROR", message, false);
      }

      if (value.event_type === "final" || !value.event_type) {
        if (Array.isArray(value.images)) {
          finalImages.push(...value.images.map(toImageBuffer));
        } else if (value.image) {
          finalImages.push(toImageBuffer(value.image));
        }
      }
    }
  }

  if (buffered.length > 0) {
    throw new NovelAiProviderError("PROVIDER_MSGPACK_FRAME_TRUNCATED", "NovelAI msgpack frame was truncated", false);
  }

  if (finalImages.length === 0) {
    throw new NovelAiProviderError("PROVIDER_MSGPACK_FINAL_IMAGE_MISSING", "NovelAI msgpack stream ended without a final image", false);
  }

  return finalImages;
}

function toImageBuffer(value: string | Buffer | Uint8Array) {
  if (typeof value === "string") return Buffer.from(value, "base64");
  return Buffer.from(value);
}
