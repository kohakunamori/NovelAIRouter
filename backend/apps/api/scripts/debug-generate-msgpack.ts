import { fetch, ProxyAgent } from "undici";
import { unpack } from "msgpackr";
import { prisma } from "../src/db.js";
import { decryptCredential } from "../src/novelai/credentials.js";
import { buildGenerateFormData } from "../src/novelai/realNovelAiProvider.js";

try {
  const account = await prisma.novelAiAccount.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { priority: "asc" },
  });
  if (!account) throw new Error("No active account");

  const credential = decryptCredential({
    credentialCiphertext: account.credentialCiphertext,
    credentialIv: account.credentialIv,
    credentialAuthTag: account.credentialAuthTag,
    credentialKeyVersion: account.credentialKeyVersion,
  });

  const response = await fetch("https://image.novelai.net/ai/generate-image-stream", {
    method: "POST",
    body: buildGenerateFormData({
      prompt: "single black pixel",
      negativePrompt: "",
      model: "nai-diffusion-4-curated-preview",
      width: 64,
      height: 64,
      steps: 1,
      scale: 1,
      sampler: "k_euler_ancestral",
      seed: 0,
    }),
    headers: {
      ...(credential.token ? { Authorization: `Bearer ${credential.token}` } : {}),
      ...(credential.cookie ? { Cookie: credential.cookie } : {}),
      ...(credential.headers ?? {}),
      "x-correlation-id": "abc123",
      "x-initiated-at": new Date().toISOString(),
    },
    dispatcher: process.env.NOVELAI_PROXY_URL ? new ProxyAgent(process.env.NOVELAI_PROXY_URL) : undefined,
  });

  console.log("status", response.status, response.headers.get("content-type"));
  const body = Buffer.from(await response.arrayBuffer());
  console.log("bodyBytes", body.length);

  let offset = 0;
  let index = 0;
  while (offset + 4 <= body.length && index < 40) {
    const len = body.readUInt32BE(offset);
    offset += 4;
    if (offset + len > body.length) {
      console.log("TRUNCATED", { index, len, remaining: body.length - offset });
      break;
    }

    const value = unpack(body.subarray(offset, offset + len)) as Record<string, unknown>;
    offset += len;
    console.dir({
      index,
      event_type: value.event_type,
      step_ix: value.step_ix,
      sigma: value.sigma,
      keys: Object.keys(value),
      imageType: value.image ? (Buffer.isBuffer(value.image) ? "buffer" : typeof value.image) : null,
      imageBytes: Buffer.isBuffer(value.image) ? value.image.length : typeof value.image === "string" ? value.image.length : null,
      message: value.message ?? null,
    }, { depth: 4 });
    index += 1;
  }
} finally {
  await prisma.$disconnect();
}
