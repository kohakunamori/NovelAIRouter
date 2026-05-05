import { Asset, type AssetKind } from "@prisma/client";
import { prisma } from "./db.js";
import { badRequest, notFound } from "./errors.js";
import { binaryStorage } from "./storage/index.js";

export async function requireOwnedAsset(assetId: string, userId: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.userId !== userId) {
    throw notFound("Asset not found");
  }
  return asset;
}

export async function loadOwnedAssetsMap(userId: string, assetIds: string[]) {
  const uniqueIds = [...new Set(assetIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map<string, Asset>();

  const assets = await prisma.asset.findMany({
    where: {
      userId,
      id: { in: uniqueIds },
    },
  });

  if (assets.length !== uniqueIds.length) {
    const found = new Set(assets.map((asset) => asset.id));
    const missing = uniqueIds.filter((assetId) => !found.has(assetId));
    throw badRequest("ASSET_NOT_FOUND", `One or more referenced assets were not found: ${missing.join(", ")}`);
  }

  return new Map(assets.map((asset) => [asset.id, asset]));
}

export async function readAssetBuffer(asset: Asset) {
  const stream = binaryStorage.createReadStream(asset.storageKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function createOwnedAssetFromBuffer(input: {
  userId: string;
  kind: AssetKind;
  mimeType: string;
  buffer: Buffer;
  originalFilename: string | null;
  prefix: string;
}) {
  const stored = await binaryStorage.writeBuffer({
    buffer: input.buffer,
    contentType: input.mimeType,
    originalFilename: input.originalFilename,
    prefix: input.prefix,
  });

  try {
    return await prisma.asset.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        mimeType: input.mimeType,
        byteSize: stored.byteSize,
        originalFilename: input.originalFilename,
        storageKey: stored.key,
      },
    });
  } catch (error) {
    await binaryStorage.delete(stored.key);
    throw error;
  }
}

export async function deleteOwnedAsset(asset: Asset) {
  await prisma.asset.delete({ where: { id: asset.id } });
  await binaryStorage.delete(asset.storageKey);
}

export function serializeAsset(asset: Asset) {
  return {
    id: asset.id,
    kind: asset.kind as AssetKind,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    originalFilename: asset.originalFilename,
    contentPath: `/api/assets/${asset.id}/content`,
    createdAt: asset.createdAt.toISOString(),
  };
}
