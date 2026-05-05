import { setTimeout as sleep } from "node:timers/promises";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { redis } from "../src/redis.js";
import { generationQueue } from "../src/generations/generationQueue.js";
import { createGenerationWorker } from "../src/generations/generationWorker.js";

const app = await buildApp();
const worker = createGenerationWorker();
const address = await app.listen({ host: "127.0.0.1", port: 4105 });

try {
  const email = `real-route-${Date.now()}@example.com`;
  const password = "route-check-password";

  const register = await fetch("http://127.0.0.1:4105/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!register.ok) throw new Error(`register failed ${register.status}: ${await register.text()}`);

  const cookie = register.headers.get("set-cookie");
  if (!cookie) throw new Error("register response did not include a session cookie");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("registered user not found in database");
  await prisma.user.update({ where: { id: user.id }, data: { balance: 1000 } });

  const create = await fetch("http://127.0.0.1:4105/api/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      input: "a quiet datacenter where ink-black machines dream in amber light",
      model: "nai-diffusion-4-5-curated",
      action: "generate",
      parameters: {
        width: 832,
        height: 1216,
        steps: 8,
        scale: 5,
        sampler: "k_euler",
        n_samples: 1,
        ucPreset: 0,
        qualityToggle: true,
        seed: 123456789,
        negative_prompt: "blurry, lowres, bad quality, text, watermark",
        image_format: "png",
      },
    }),
  });
  if (!create.ok) throw new Error(`create generation failed ${create.status}: ${await create.text()}`);

  const { jobId } = await create.json() as { jobId: string };

  const resultResponsePromise = fetch(`http://127.0.0.1:4105/api/generations/${jobId}/results/0`, {
    headers: { Cookie: cookie },
  });

  const detail = await waitForJob(jobId, cookie);
  const resultResponse = await resultResponsePromise;
  if (!resultResponse.ok) throw new Error(`result fetch failed ${resultResponse.status}: ${await resultResponse.text()}`);
  const blob = await resultResponse.blob();

  console.log(JSON.stringify({
    address,
    jobId,
    resultBytes: blob.size,
    resultMimeType: resultResponse.headers.get("content-type"),
    detail,
  }, null, 2));
} finally {
  await worker.close();
  await generationQueue.close();
  await app.close();
  await redis.quit();
  await prisma.$disconnect();
}

async function waitForJob(jobId: string, cookie: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:4105/api/generations/${jobId}`, {
      headers: { Cookie: cookie },
    });
    if (!response.ok) throw new Error(`job detail failed ${response.status}: ${await response.text()}`);

    const payload = await response.json() as { job: { status: string; novelAiAccountId: string | null; actualNovelAiAnlas: number | null; billedPlatformUnits: number | null; resultMimeType: string | null } };
    if (payload.job.status === "SUCCEEDED" || payload.job.status === "FAILED" || payload.job.status === "CANCELLED") {
      return payload.job;
    }
    await sleep(500);
  }

  throw new Error(`job ${jobId} did not finish in time`);
}
