import { buildApp } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { redis } from "./redis.js";
import { generationQueue } from "./generations/generationQueue.js";
import { createGenerationWorker } from "./generations/generationWorker.js";
import { ensureCredentialEncryptionKeyInitialized, ensureRuntimeConfigInitialized } from "./runtimeConfig.js";

ensureRuntimeConfigInitialized();
ensureCredentialEncryptionKeyInitialized();

const app = await buildApp();
const generationWorker = createGenerationWorker();

const close = async () => {
  await generationWorker.close();
  await generationQueue.close();
  await app.close();
  await redis.quit();
  await prisma.$disconnect();
};

process.on("SIGINT", () => {
  void close().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void close().finally(() => process.exit(0));
});

await app.listen({ host: env.API_HOST, port: env.API_PORT });
