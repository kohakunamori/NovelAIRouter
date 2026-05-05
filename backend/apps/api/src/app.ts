import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { buildAllowedOrigins } from "./cors.js";
import { env } from "./env.js";
import { errorHandler } from "./errors.js";
import { prisma } from "./db.js";
import { getRuntimeConfig, getSessionSecret } from "./runtimeConfig.js";
import { redis } from "./redis.js";
import { authRoutes } from "./auth/auth.routes.js";
import { userSettingsRoutes } from "./userSettings.routes.js";
import { jobsRoutes } from "./admin/jobs.routes.js";
import { ledgerRoutes } from "./admin/ledger.routes.js";
import { overviewRoutes } from "./admin/overview.routes.js";
import { policiesRoutes } from "./admin/policies.routes.js";
import { runtimeConfigRoutes } from "./admin/runtimeConfig.routes.js";
import { settingsRoutes } from "./admin/settings.routes.js";
import { novelAiAccountsRoutes } from "./admin/novelaiAccounts.routes.js";
import { usersRoutes } from "./admin/users.routes.js";
import { generationRoutes } from "./generations/generation.routes.js";
import { assetRoutes } from "./assets.routes.js";
import { novelAiRoutes } from "./novelai/novelAi.routes.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  app.setErrorHandler(errorHandler);

  app.addContentTypeParser(/^image\/.+$/, { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  const allowedOrigins = buildAllowedOrigins(env.WEB_ORIGIN);

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  await app.register(cookie, {
    secret: getSessionSecret(),
  });

  const runtimeConfig = getRuntimeConfig();

  await app.register(multipart, {
    limits: {
      fileSize: runtimeConfig.assetUploadMaxBytes,
      files: 17,
    },
  });

  app.get("/api/health", async () => {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    return { ok: true };
  });

  await app.register(authRoutes);
  await app.register(userSettingsRoutes);
  await app.register(overviewRoutes);
  await app.register(settingsRoutes);
  await app.register(runtimeConfigRoutes);
  await app.register(policiesRoutes);
  await app.register(usersRoutes);
  await app.register(jobsRoutes);
  await app.register(ledgerRoutes);
  await app.register(novelAiAccountsRoutes);
  await app.register(assetRoutes);
  await app.register(novelAiRoutes);
  await app.register(generationRoutes);

  return app;
}

