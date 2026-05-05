import { z } from "zod";

export const assetKindSchema = z.enum(["REFERENCE_IMAGE", "GENERATED_IMAGE"]);

export const assetSummarySchema = z.object({
  id: z.string(),
  kind: assetKindSchema,
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  originalFilename: z.string().nullable(),
  contentPath: z.string().min(1),
  createdAt: z.string(),
});

export const assetListResponseSchema = z.object({
  assets: z.array(assetSummarySchema),
});

export const assetDetailResponseSchema = z.object({
  asset: assetSummarySchema,
});

export const assetUploadResponseSchema = z.object({
  asset: assetSummarySchema,
});

export type AssetKind = z.infer<typeof assetKindSchema>;
export type AssetSummary = z.infer<typeof assetSummarySchema>;
export type AssetListResponse = z.infer<typeof assetListResponseSchema>;
export type AssetDetailResponse = z.infer<typeof assetDetailResponseSchema>;
export type AssetUploadResponse = z.infer<typeof assetUploadResponseSchema>;
