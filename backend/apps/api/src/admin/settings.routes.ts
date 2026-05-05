import type { FastifyInstance } from "fastify";
import { platformSettingsSchema, updatePlatformSettingsSchema } from "@novelai-router/shared";
import { prisma } from "../db.js";
import { currentUser, requireAdmin } from "../auth/guards.js";
import { getPlatformSettings } from "../billing/billing.js";

function serializeSettings(settings: { anlasMultiplier: unknown; updatedAt: Date }) {
  return platformSettingsSchema.parse({
    anlasMultiplier: Number(settings.anlasMultiplier),
    updatedAt: settings.updatedAt.toISOString(),
  });
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/api/admin/settings", { preHandler: requireAdmin }, async () => {
    return serializeSettings(await getPlatformSettings());
  });

  app.patch("/api/admin/settings", { preHandler: requireAdmin }, async (request) => {
    const body = updatePlatformSettingsSchema.parse(request.body);
    const user = currentUser(request);
    const settings = await prisma.platformSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        anlasMultiplier: body.anlasMultiplier,
        updatedByUserId: user.id,
      },
      update: {
        anlasMultiplier: body.anlasMultiplier,
        updatedByUserId: user.id,
      },
    });
    return serializeSettings(settings);
  });
}
