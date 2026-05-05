import { z } from "zod";
import { adminGenerationDetailSchema, adminGenerationRecordSchema } from "./generation.js";

export const generationHistoryEntrySchema = adminGenerationRecordSchema;

export const generationHistoryListResponseSchema = z.object({
  jobs: z.array(generationHistoryEntrySchema),
});

export const generationHistoryDetailResponseSchema = z.object({
  job: adminGenerationDetailSchema,
});

export type GenerationHistoryEntry = z.infer<typeof generationHistoryEntrySchema>;
export type GenerationHistoryListResponse = z.infer<typeof generationHistoryListResponseSchema>;
export type GenerationHistoryDetailResponse = z.infer<typeof generationHistoryDetailResponseSchema>;
