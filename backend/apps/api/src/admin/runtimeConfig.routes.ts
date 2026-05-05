import type { FastifyInstance } from "fastify";
import { backendRuntimeConfigSchema, updateBackendRuntimeConfigSchema } from "@novelai-router/shared";
import { requireAdmin } from "../auth/guards.js";
import {
  getCredentialEncryptionStatus,
  getRuntimeConfigPaths,
  ensureCredentialEncryptionKeyInitialized,
  ensureRuntimeConfigInitialized,
  updateRuntimeConfig,
} from "../runtimeConfig.js";

function serializeRuntimeConfig() {
  const document = ensureRuntimeConfigInitialized();
  ensureCredentialEncryptionKeyInitialized();
  return backendRuntimeConfigSchema.parse({
    ...document.values,
    updatedAt: document.updatedAt,
    credentialEncryption: getCredentialEncryptionStatus(),
  });
}

export async function runtimeConfigRoutes(app: FastifyInstance) {
  app.get("/api/admin/runtime-config", { preHandler: requireAdmin }, async () => {
    return serializeRuntimeConfig();
  });

  app.patch("/api/admin/runtime-config", { preHandler: requireAdmin }, async (request) => {
    const body = updateBackendRuntimeConfigSchema.parse(request.body);
    updateRuntimeConfig(body);
    return serializeRuntimeConfig();
  });

  app.get("/api/admin/runtime-config/paths", { preHandler: requireAdmin }, async () => {
    return getRuntimeConfigPaths();
  });
}
