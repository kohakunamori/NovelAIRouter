import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  assetDetailResponseSchema,
  assetKindSchema,
  assetListResponseSchema,
  assetUploadResponseSchema,
} from "@novelai-router/shared";
import { currentUser, requireAuth } from "./auth/guards.js";
import { prisma } from "./db.js";
import { badRequest } from "./errors.js";
import { createOwnedAssetFromBuffer, requireOwnedAsset, serializeAsset } from "./assetsService.js";
import { getRuntimeConfig } from "./runtimeConfig.js";
import { binaryStorage } from "./storage/index.js";

const assetParamsSchema = z.object({ assetId: z.string().min(1) });
const assetQuerySchema = z.object({ kind: assetKindSchema.optional() });
const assetHeadersSchema = z.object({
  "content-type": z.string().min(1),
  "x-original-filename": z.string().max(260).optional(),
});

export async function assetRoutes(app: FastifyInstance) {
  app.post("/api/assets", { preHandler: requireAuth, bodyLimit: getRuntimeConfig().assetUploadMaxBytes }, async (request) => {
    const user = currentUser(request);
    const headers = assetHeadersSchema.parse(request.headers);
    const mimeType = headers["content-type"].split(";")[0]?.trim().toLowerCase() ?? "";
    if (!mimeType.startsWith("image/")) {
      throw badRequest("UNSUPPORTED_ASSET_TYPE", "Only image uploads are supported for assets");
    }

    const body = request.body;
    const runtimeConfig = getRuntimeConfig();
    if (!Buffer.isBuffer(body) || body.byteLength === 0) {
      throw badRequest("INVALID_ASSET_UPLOAD", "Asset upload body must contain image bytes");
    }
    if (body.byteLength > runtimeConfig.assetUploadMaxBytes) {
      throw badRequest("ASSET_TOO_LARGE", `Asset exceeds upload limit of ${runtimeConfig.assetUploadMaxBytes} bytes`);
    }

    const asset = await createOwnedAssetFromBuffer({
      userId: user.id,
      kind: "REFERENCE_IMAGE",
      mimeType,
      buffer: body,
      originalFilename: headers["x-original-filename"] ?? null,
      prefix: "assets",
    });

    return assetUploadResponseSchema.parse({ asset: serializeAsset(asset) });
  });

  app.get("/api/assets", { preHandler: requireAuth }, async (request) => {
    const user = currentUser(request);
    const query = assetQuerySchema.parse(request.query);
    const assets = await prisma.asset.findMany({
      where: {
        userId: user.id,
        ...(query.kind ? { kind: query.kind } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return assetListResponseSchema.parse({
      assets: assets.map(serializeAsset),
    });
  });

  app.get("/api/assets/:assetId", { preHandler: requireAuth }, async (request) => {
    const user = currentUser(request);
    const params = assetParamsSchema.parse(request.params);
    const asset = await requireOwnedAsset(params.assetId, user.id);
    return assetDetailResponseSchema.parse({ asset: serializeAsset(asset) });
  });

  app.get("/api/assets/:assetId/content", { preHandler: requireAuth }, async (request, reply) => {
    const user = currentUser(request);
    const params = assetParamsSchema.parse(request.params);
    const asset = await requireOwnedAsset(params.assetId, user.id);
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.type(asset.mimeType);
    return reply.send(binaryStorage.createReadStream(asset.storageKey));
  });
}
