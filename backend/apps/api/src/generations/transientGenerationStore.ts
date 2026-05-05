import { redis } from "../redis.js";

// Keep inline uploads available long enough to survive queue backlogs.
// The worker still clears these references explicitly on success/failure.
const referenceTtlSeconds = 24 * 60 * 60;
const refsKey = (jobId: string) => `generation:refs:${jobId}`;

export type TransientImagePayload = {
  mimeType: string;
  originalFilename: string | null;
  base64: string;
};

export type TransientGenerationReferences = {
  baseImage: (TransientImagePayload & { strength: number }) | null;
  vibeTransfers: Array<TransientImagePayload & {
    strength: number;
    informationExtracted: boolean;
  }>;
  preciseReferences: Array<TransientImagePayload & {
    prompt: string;
    strength: number;
    secondaryStrength: number;
    informationExtracted: boolean;
  }>;
};

export async function storeTransientGenerationReferences(jobId: string, payload: TransientGenerationReferences) {
  await redis.set(refsKey(jobId), JSON.stringify(payload), "EX", referenceTtlSeconds);
}

export async function loadTransientGenerationReferences(jobId: string) {
  const payload = await redis.get(refsKey(jobId));
  return payload ? JSON.parse(payload) as TransientGenerationReferences : null;
}

export async function clearTransientGenerationReferences(jobId: string) {
  await redis.del(refsKey(jobId));
}
