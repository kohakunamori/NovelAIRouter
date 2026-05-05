import { z } from "zod";
import { assetSummarySchema } from "./assets.js";
import { generationJobStatusSchema, generationParamsSchema } from "./generation.js";
import { policyDecisionSchema } from "./policy.js";

const eventBaseSchema = z.object({
  jobId: z.string(),
  at: z.string(),
});

export const queuedEventSchema = eventBaseSchema.extend({
  type: z.literal("queued"),
  position: z.number().int().nullable(),
});

export const policyAppliedEventSchema = eventBaseSchema.extend({
  type: z.literal("policy_applied"),
  decision: policyDecisionSchema,
});

export const waitingForResultConsumerEventSchema = eventBaseSchema.extend({
  type: z.literal("waiting_for_result_consumer"),
});

export const runningEventSchema = eventBaseSchema.extend({
  type: z.literal("running"),
  normalizedParams: generationParamsSchema,
});

export const providerProgressEventSchema = eventBaseSchema.extend({
  type: z.literal("provider_progress"),
  message: z.string(),
});

export const intermediateOutputReadyEventSchema = eventBaseSchema.extend({
  type: z.literal("intermediate_output_ready"),
  outputIndex: z.number().int().nonnegative(),
  stepIndex: z.number().int().nonnegative(),
  mimeType: z.string(),
  imageBase64: z.string(),
  totalSteps: z.number().int().positive().nullable(),
  sigma: z.number().nullable(),
  providerGenerationId: z.string().nullable(),
});

export const outputReadyEventSchema = eventBaseSchema.extend({
  type: z.literal("output_ready"),
  outputIndex: z.number().int().nonnegative(),
  outputCount: z.number().int().positive(),
  mimeType: z.string(),
  asset: assetSummarySchema,
});

export const billingRecordedEventSchema = eventBaseSchema.extend({
  type: z.literal("billing_recorded"),
  actualNovelAiAnlas: z.number(),
  platformMultiplierSnapshot: z.number(),
  billedPlatformUnits: z.number(),
});

export const terminalEventSchema = eventBaseSchema.extend({
  type: z.enum(["succeeded", "failed", "cancelled"]),
  status: generationJobStatusSchema,
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export const generationEventSchema = z.discriminatedUnion("type", [
  queuedEventSchema,
  policyAppliedEventSchema,
  waitingForResultConsumerEventSchema,
  runningEventSchema,
  providerProgressEventSchema,
  intermediateOutputReadyEventSchema,
  outputReadyEventSchema,
  billingRecordedEventSchema,
  terminalEventSchema,
]);

export type QueuedEvent = z.infer<typeof queuedEventSchema>;
export type PolicyAppliedEvent = z.infer<typeof policyAppliedEventSchema>;
export type WaitingForResultConsumerEvent = z.infer<typeof waitingForResultConsumerEventSchema>;
export type RunningEvent = z.infer<typeof runningEventSchema>;
export type ProviderProgressEvent = z.infer<typeof providerProgressEventSchema>;
export type IntermediateOutputReadyEvent = z.infer<typeof intermediateOutputReadyEventSchema>;
export type OutputReadyEvent = z.infer<typeof outputReadyEventSchema>;
export type BillingRecordedEvent = z.infer<typeof billingRecordedEventSchema>;
export type TerminalEvent = z.infer<typeof terminalEventSchema>;
export type GenerationEvent = z.infer<typeof generationEventSchema>;
