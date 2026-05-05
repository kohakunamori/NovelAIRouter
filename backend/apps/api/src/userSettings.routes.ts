import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import {
  promptChunkLibraryResponseSchema,
  promptChunkLibrarySchema,
  updatePromptChunkLibraryRequestSchema,
  type PromptChunkLibrary,
} from "@novelai-router/shared";
import { currentUser, requireAuth } from "./auth/guards.js";
import { prisma } from "./db.js";

type PromptChunkLibraryRecord = {
  libraryJson: unknown;
  updatedAt: Date;
};

function toJson(value: PromptChunkLibrary): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function serializePromptChunkLibrary(record: PromptChunkLibraryRecord | null) {
  return promptChunkLibraryResponseSchema.parse({
    library: record ? promptChunkLibrarySchema.parse(record.libraryJson) : null,
    updatedAt: record?.updatedAt.toISOString() ?? null,
  });
}

export async function userSettingsRoutes(app: FastifyInstance) {
  app.get("/api/user-settings/prompt-chunks", { preHandler: requireAuth }, async (request) => {
    const user = currentUser(request);
    const library = await prisma.userPromptChunkLibrary.findUnique({
      where: { userId: user.id },
      select: { libraryJson: true, updatedAt: true },
    });

    return serializePromptChunkLibrary(library);
  });

  app.put("/api/user-settings/prompt-chunks", { preHandler: requireAuth }, async (request) => {
    const user = currentUser(request);
    const body = updatePromptChunkLibraryRequestSchema.parse(request.body);
    const libraryJson = toJson(body);
    const library = await prisma.userPromptChunkLibrary.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        libraryJson,
      },
      update: {
        libraryJson,
      },
      select: { libraryJson: true, updatedAt: true },
    });

    return serializePromptChunkLibrary(library);
  });
}
