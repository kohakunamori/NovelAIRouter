import { z } from "zod";
import {
  assetDetailResponseSchema,
  assetListResponseSchema,
  assetUploadResponseSchema,
} from "./assets.js";
import {
  generationHistoryDetailResponseSchema,
  generationHistoryListResponseSchema,
} from "./history.js";
import {
  generationDetailSchema,
  generationStatusSchema,
  generationJobStatusSchema,
  modelSchema,
} from "./generation.js";
import { novelAiReadinessSchema } from "./novelaiAccounts.js";

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const registerRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(200),
});

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const userRoleSchema = z.enum(["USER", "ADMIN"]);
export const userStatusSchema = z.enum(["ACTIVE", "DISABLED"]);

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
  status: userStatusSchema,
  createdAt: z.string(),
});

export const authResponseSchema = z.object({
  user: userSchema,
});

export const authBalanceResponseSchema = z.object({
  balance: z.number().int(),
});

export const platformSettingsSchema = z.object({
  anlasMultiplier: z.number().positive(),
  updatedAt: z.string(),
});

export const updatePlatformSettingsSchema = z.object({
  anlasMultiplier: z.coerce.number().positive().max(100),
});

export const promptChunkCategorySchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(120),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export const promptChunkSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(120),
  content: z.string().min(1).max(2000),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  categoryId: z.string().min(1).max(200).nullable(),
});

export const promptChunkLibrarySchema = z.object({
  categories: z.array(promptChunkCategorySchema).max(100),
  chunks: z.array(promptChunkSchema).max(250),
}).superRefine((library, context) => {
  const categoryIds = new Set<string>();
  library.categories.forEach((category, index) => {
    if (categoryIds.has(category.id)) {
      context.addIssue({ code: "custom", message: "Category IDs must be unique", path: ["categories", index, "id"] });
      return;
    }

    categoryIds.add(category.id);
  });

  const chunkIds = new Set<string>();
  library.chunks.forEach((chunk, index) => {
    if (chunkIds.has(chunk.id)) {
      context.addIssue({ code: "custom", message: "Chunk IDs must be unique", path: ["chunks", index, "id"] });
      return;
    }

    chunkIds.add(chunk.id);
    if (chunk.categoryId !== null && !categoryIds.has(chunk.categoryId)) {
      context.addIssue({ code: "custom", message: "Chunk categoryId must reference an existing category", path: ["chunks", index, "categoryId"] });
    }
  });
});

export const promptChunkLibraryResponseSchema = z.object({
  library: promptChunkLibrarySchema.nullable(),
  updatedAt: z.string().nullable(),
});

export const updatePromptChunkLibraryRequestSchema = promptChunkLibrarySchema;

export const grantLedgerRequestSchema = z.object({
  platformUnits: z.coerce.number().int().positive(),
});

export const updateAdminUserRequestSchema = z.object({
  status: userStatusSchema.optional(),
  balance: z.coerce.number().int().optional(),
}).refine((value) => value.status !== undefined || value.balance !== undefined, {
  message: "At least one field must be provided",
});

export const deleteAdminUserResponseSchema = z.object({
  ok: z.literal(true),
});

export const adminPaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const adminJobsQuerySchema = adminPaginationQuerySchema.extend({
  userId: z.string().optional(),
  novelAiAccountId: z.string().optional(),
});

export const adminPaginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
});

export const adminUserSummarySchema = userSchema.extend({
  balance: z.number().int(),
  updatedAt: z.string(),
  generationCount: z.number().int().nonnegative(),
});

export const adminUserListResponseSchema = z.object({
  users: z.array(adminUserSummarySchema),
});

export const adminLedgerEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  userEmail: z.string().email(),
  generationJobId: z.string().nullable(),
  type: z.string(),
  novelAiAnlas: z.number().int().nullable(),
  multiplier: z.number().nullable(),
  platformUnits: z.number().int(),
  balanceAfter: z.number().int(),
  createdByUserId: z.string().nullable(),
  createdByUserEmail: z.string().email().nullable(),
  createdAt: z.string(),
});

export const adminLedgerListResponseSchema = z.object({
  entries: z.array(adminLedgerEntrySchema),
  pagination: adminPaginationSchema,
});

export const adminJobListResponseSchema = z.object({
  jobs: z.array(z.object({
    id: z.string(),
    status: generationJobStatusSchema,
    createdAt: z.string(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    outputBytes: z.number().int().nonnegative(),
    intermediateOutputCount: z.number().int().nonnegative(),
    intermediateOutputSseBytes: z.number().int().nonnegative(),
    estimatedNovelAiAnlas: z.number().int().nullable(),
    actualNovelAiAnlas: z.number().int().nullable(),
    billedPlatformUnits: z.number().nullable(),
    outputCount: z.number().int().nonnegative(),
    resultMimeType: z.string().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    submittedParamsJson: z.unknown(),
    normalizedParamsJson: z.unknown().nullable(),
    user: adminUserSummarySchema.pick({
      id: true,
      email: true,
      role: true,
      status: true,
      balance: true,
      createdAt: true,
      updatedAt: true,
      generationCount: true,
    }),
    upstreamAccount: z.object({
      id: z.string(),
      label: z.string(),
      remoteAccountLabel: z.string().nullable(),
    }).nullable(),
  })),
  pagination: adminPaginationSchema,
});

export const deleteAdminJobsPageRequestSchema = adminPaginationQuerySchema;

export const deleteAdminJobsPageResponseSchema = z.object({
  deletedCount: z.number().int().nonnegative(),
});

export const adminJobDetailResponseSchema = z.object({
  id: z.string(),
  status: generationJobStatusSchema,
  outputCount: z.number().int().nonnegative(),
  resultMimeType: z.string().nullable(),
  outputs: z.array(z.object({
    index: z.number().int().nonnegative(),
    asset: z.object({
      id: z.string(),
      mimeType: z.string(),
      originalFilename: z.string().nullable(),
    }),
  })),
});

export const backendRuntimeConfigSchema = z.object({
  generationConcurrency: z.number().int().positive(),
  resultConsumerTimeoutMs: z.number().int().positive(),
  assetUploadMaxBytes: z.number().int().positive(),
  novelAiCredentialKeyVersion: z.number().int().positive(),
  novelAiAccountLeaseTtlMs: z.number().int().positive(),
  novelAiAccountLeaseHeartbeatMs: z.number().int().positive(),
  novelAiAccountAcquireTimeoutMs: z.number().int().positive(),
  novelAiAccountCooldownMs: z.number().int().positive(),
  novelAiHttpTimeoutMs: z.number().int().positive(),
  novelAiTestTimeoutMs: z.number().int().positive(),
  novelAiProxyUrl: z.string().url().nullable(),
  novelAiHealthCheckUrl: z.string().url().nullable(),
  novelAiAdminHealthChecksEnabled: z.boolean(),
  novelAiSmokeTestsEnabled: z.boolean(),
  updatedAt: z.string(),
  credentialEncryption: z.object({
    mode: z.enum(["auto_file", "env_override"]),
    keyPresent: z.boolean(),
  }),
});

export const updateBackendRuntimeConfigSchema = z.object({
  generationConcurrency: z.coerce.number().int().positive().optional(),
  resultConsumerTimeoutMs: z.coerce.number().int().positive().optional(),
  assetUploadMaxBytes: z.coerce.number().int().positive().optional(),
  novelAiCredentialKeyVersion: z.coerce.number().int().positive().optional(),
  novelAiAccountLeaseTtlMs: z.coerce.number().int().positive().optional(),
  novelAiAccountLeaseHeartbeatMs: z.coerce.number().int().positive().optional(),
  novelAiAccountAcquireTimeoutMs: z.coerce.number().int().positive().optional(),
  novelAiAccountCooldownMs: z.coerce.number().int().positive().optional(),
  novelAiHttpTimeoutMs: z.coerce.number().int().positive().optional(),
  novelAiTestTimeoutMs: z.coerce.number().int().positive().optional(),
  novelAiProxyUrl: z.preprocess((value) => (value === "" ? null : value), z.string().url().nullable()).optional(),
  novelAiHealthCheckUrl: z.preprocess((value) => (value === "" ? null : value), z.string().url().nullable()).optional(),
  novelAiAdminHealthChecksEnabled: z.boolean().optional(),
  novelAiSmokeTestsEnabled: z.boolean().optional(),
});

export const createGenerationResponseSchema = z.object({
  jobId: z.string(),
});

export const suggestTagsQuerySchema = z.object({
  model: modelSchema,
  prompt: z.string().trim().min(1).max(8000),
});

export const suggestTagSchema = z.object({
  tag: z.string().min(1),
  count: z.number().int().nonnegative(),
  confidence: z.number().nonnegative(),
});

export const suggestTagsResponseSchema = z.object({
  tags: z.array(suggestTagSchema),
});

export const novelAiBalanceResponseSchema = z.object({
  anlas: z.number().int().nonnegative(),
});

export const galleryOrderResponseSchema = z.object({
  seed: z.string().min(1),
  updatedAt: z.string(),
});

export const adminOverviewSchema = z.object({
  generatedAt: z.string(),
  readiness: novelAiReadinessSchema,
  accounts: z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    disabled: z.number().int().nonnegative(),
    cooldown: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
    leased: z.number().int().nonnegative(),
  }),
  generations: z.object({
    total: z.number().int().nonnegative(),
    last24h: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    totalTrackedAnlas: z.number().int().nonnegative(),
  }),
  policies: z.object({
    total: z.number().int().nonnegative(),
    enabled: z.number().int().nonnegative(),
    disabled: z.number().int().nonnegative(),
  }),
  settings: platformSettingsSchema,
  galleryOrder: galleryOrderResponseSchema,
  recentJobs: z.array(z.object({
    id: z.string(),
    status: generationJobStatusSchema,
    createdAt: z.string(),
    actualNovelAiAnlas: z.number().int().nullable(),
    estimatedNovelAiAnlas: z.number().int().nullable(),
    billedPlatformUnits: z.number().nullable(),
    novelAiAccountId: z.string().nullable(),
  })).max(10),
});

export const generationListResponseSchema = z.object({
  jobs: z.array(generationStatusSchema),
});
export const generationDetailResponseSchema = z.object({
  job: generationDetailSchema,
});
export const generationHistoryListApiResponseSchema = generationHistoryListResponseSchema;
export const generationHistoryDetailApiResponseSchema = generationHistoryDetailResponseSchema;
export const assetListApiResponseSchema = assetListResponseSchema;
export const assetDetailApiResponseSchema = assetDetailResponseSchema;
export const assetUploadApiResponseSchema = assetUploadResponseSchema;

export type ApiError = z.infer<typeof apiErrorSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type User = z.infer<typeof userSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type AuthBalanceResponse = z.infer<typeof authBalanceResponseSchema>;
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;
export type UpdatePlatformSettings = z.infer<typeof updatePlatformSettingsSchema>;
export type PromptChunkCategory = z.infer<typeof promptChunkCategorySchema>;
export type PromptChunk = z.infer<typeof promptChunkSchema>;
export type PromptChunkLibrary = z.infer<typeof promptChunkLibrarySchema>;
export type PromptChunkLibraryResponse = z.infer<typeof promptChunkLibraryResponseSchema>;
export type UpdatePromptChunkLibraryRequest = z.infer<typeof updatePromptChunkLibraryRequestSchema>;
export type GrantLedgerRequest = z.infer<typeof grantLedgerRequestSchema>;
export type UpdateAdminUserRequest = z.infer<typeof updateAdminUserRequestSchema>;
export type DeleteAdminUserResponse = z.infer<typeof deleteAdminUserResponseSchema>;
export type AdminPaginationQuery = z.infer<typeof adminPaginationQuerySchema>;
export type AdminJobsQuery = z.infer<typeof adminJobsQuerySchema>;
export type AdminPagination = z.infer<typeof adminPaginationSchema>;
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;
export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;
export type AdminLedgerEntry = z.infer<typeof adminLedgerEntrySchema>;
export type AdminLedgerListResponse = z.infer<typeof adminLedgerListResponseSchema>;
export type AdminJobListResponse = z.infer<typeof adminJobListResponseSchema>;
export type AdminJobDetailResponse = z.infer<typeof adminJobDetailResponseSchema>;
export type DeleteAdminJobsPageRequest = z.infer<typeof deleteAdminJobsPageRequestSchema>;
export type DeleteAdminJobsPageResponse = z.infer<typeof deleteAdminJobsPageResponseSchema>;
export type BackendRuntimeConfig = z.infer<typeof backendRuntimeConfigSchema>;
export type UpdateBackendRuntimeConfig = z.infer<typeof updateBackendRuntimeConfigSchema>;
export type AdminOverview = z.infer<typeof adminOverviewSchema>;
export type CreateGenerationResponse = z.infer<typeof createGenerationResponseSchema>;
export type SuggestTagsQuery = z.infer<typeof suggestTagsQuerySchema>;
export type SuggestTag = z.infer<typeof suggestTagSchema>;
export type SuggestTagsResponse = z.infer<typeof suggestTagsResponseSchema>;
export type NovelAiBalanceResponse = z.infer<typeof novelAiBalanceResponseSchema>;
export type GalleryOrderResponse = z.infer<typeof galleryOrderResponseSchema>;
export type GenerationListResponse = z.infer<typeof generationListResponseSchema>;
export type GenerationDetailResponse = z.infer<typeof generationDetailResponseSchema>;
export type AssetListApiResponse = z.infer<typeof assetListApiResponseSchema>;
export type AssetDetailApiResponse = z.infer<typeof assetDetailApiResponseSchema>;
export type AssetUploadApiResponse = z.infer<typeof assetUploadApiResponseSchema>;
