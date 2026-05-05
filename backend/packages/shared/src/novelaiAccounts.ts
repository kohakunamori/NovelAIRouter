import { z } from "zod";

export const novelAiAccountStatusSchema = z.enum(["ACTIVE", "DISABLED", "COOLDOWN", "ERROR"]);
export const novelAiCredentialKindSchema = z.enum(["API_TOKEN", "SESSION_COOKIE", "CUSTOM_JSON"]);

export const novelAiCredentialPayloadSchema = z.object({
  token: z.string().min(1).optional(),
  cookie: z.string().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  notes: z.string().max(2000).optional(),
}).refine((payload) => payload.token || payload.cookie || payload.headers, {
  message: "Credential payload must include token, cookie, or headers",
});

export const maskedCredentialMetadataSchema = z.object({
  hasToken: z.boolean(),
  hasCookie: z.boolean(),
  headerNames: z.array(z.string()),
  notes: z.string().nullable(),
});

export const createNovelAiAccountRequestSchema = z.object({
  label: z.string().trim().min(1).max(120),
  credentialKind: novelAiCredentialKindSchema,
  credential: novelAiCredentialPayloadSchema,
  priority: z.coerce.number().int().default(0),
  maxConcurrentJobs: z.coerce.number().int().min(1).max(1).default(1),
});

export const updateNovelAiAccountRequestSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  status: novelAiAccountStatusSchema.optional(),
  priority: z.coerce.number().int().optional(),
  maxConcurrentJobs: z.coerce.number().int().min(1).max(1).optional(),
  cooldownUntil: z.string().datetime().nullable().optional(),
});

export const rotateNovelAiCredentialRequestSchema = z.object({
  credentialKind: novelAiCredentialKindSchema,
  credential: novelAiCredentialPayloadSchema,
});

export const novelAiAccountSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  status: novelAiAccountStatusSchema,
  credentialKind: novelAiCredentialKindSchema,
  credentialKeyVersion: z.number().int(),
  credentialMetadata: maskedCredentialMetadataSchema,
  priority: z.number().int(),
  maxConcurrentJobs: z.number().int(),
  cooldownUntil: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  lastFailureAt: z.string().nullable(),
  failureCount: z.number().int(),
  lastErrorCode: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  remoteAccountLabel: z.string().nullable(),
  remoteAnlasBalance: z.number().int().nullable(),
  remoteTier: z.number().int().nullable(),
  remoteActive: z.boolean().nullable(),
  remoteUnlimitedImageGeneration: z.boolean().nullable(),
  remoteMaxPriorityActions: z.number().int().nullable(),
  remoteFixedTrainingStepsLeft: z.number().int().nullable(),
  remotePurchasedTrainingSteps: z.number().int().nullable(),
  leased: z.boolean(),
  leasedGenerationJobId: z.string().nullable(),
  leaseTtlMs: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const novelAiAccountTestModeSchema = z.enum(["health_check", "smoke_test"]);

export const testNovelAiAccountRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("health_check"), acknowledgeNetwork: z.literal(true) }),
  z.object({
    mode: z.literal("smoke_test"),
    acknowledgeNetwork: z.literal(true),
    acknowledgeAnlasSpend: z.literal(true),
    confirmationText: z.literal("SPEND_ANLAS"),
  }),
]);

export const testNovelAiAccountSafetySchema = z.object({
  networkUsed: z.boolean(),
  credentialSent: z.boolean(),
  mayConsumeAnlas: z.boolean(),
  anlasConsumed: z.number().int().nullable(),
});

export const testNovelAiAccountRemoteSchema = z.object({
  accountLabel: z.string().nullable(),
  anlasBalance: z.number().int().nullable(),
  requestId: z.string().nullable(),
  tier: z.number().int().nullable(),
  active: z.boolean().nullable(),
  unlimitedImageGeneration: z.boolean().nullable(),
  maxPriorityActions: z.number().int().nullable(),
  fixedTrainingStepsLeft: z.number().int().nullable(),
  purchasedTrainingSteps: z.number().int().nullable(),
}).partial();

export const novelAiReadinessSchema = z.object({
  readyForRealGeneration: z.boolean(),
  blockers: z.array(z.string()),
});

export const novelAiAccountPoolConfigSchema = z.object({
  proxyConfigured: z.boolean(),
  healthChecksEnabled: z.boolean(),
  smokeTestsEnabled: z.boolean(),
  readiness: novelAiReadinessSchema,
});

export const testNovelAiAccountResponseSchema = z.object({
  ok: z.boolean(),
  mode: novelAiAccountTestModeSchema,
  message: z.string(),
  safety: testNovelAiAccountSafetySchema,
  remote: testNovelAiAccountRemoteSchema.optional(),
  account: novelAiAccountSummarySchema,
});

export const novelAiAccountListResponseSchema = z.object({
  accounts: z.array(novelAiAccountSummarySchema),
  config: novelAiAccountPoolConfigSchema,
});

export type NovelAiAccountStatus = z.infer<typeof novelAiAccountStatusSchema>;
export type NovelAiCredentialKind = z.infer<typeof novelAiCredentialKindSchema>;
export type NovelAiCredentialPayload = z.infer<typeof novelAiCredentialPayloadSchema>;
export type MaskedCredentialMetadata = z.infer<typeof maskedCredentialMetadataSchema>;
export type CreateNovelAiAccountRequest = z.infer<typeof createNovelAiAccountRequestSchema>;
export type UpdateNovelAiAccountRequest = z.infer<typeof updateNovelAiAccountRequestSchema>;
export type RotateNovelAiCredentialRequest = z.infer<typeof rotateNovelAiCredentialRequestSchema>;
export type TestNovelAiAccountRequest = z.infer<typeof testNovelAiAccountRequestSchema>;
export type TestNovelAiAccountResponse = z.infer<typeof testNovelAiAccountResponseSchema>;
export type NovelAiAccountSummary = z.infer<typeof novelAiAccountSummarySchema>;
export type NovelAiReadiness = z.infer<typeof novelAiReadinessSchema>;
export type NovelAiAccountPoolConfig = z.infer<typeof novelAiAccountPoolConfigSchema>;
export type NovelAiAccountListResponse = z.infer<typeof novelAiAccountListResponseSchema>;
