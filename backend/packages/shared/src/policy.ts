import { z } from "zod";
import { generationParamsSchema } from "./generation.js";

export const policyScopeSchema = z.enum(["GLOBAL", "ROLE", "USER"]);
export const policyRuleActionSchema = z.enum([
  "default",
  "clamp",
  "force",
  "allowValues",
  "denyValues",
  "rejectWhen",
]);

const baseRuleSchema = z.object({
  id: z.string().min(1),
  field: z.string().min(1),
  description: z.string().optional(),
});

export const defaultRuleSchema = baseRuleSchema.extend({
  action: z.literal("default"),
  value: z.unknown(),
});

export const clampRuleSchema = baseRuleSchema.extend({
  action: z.literal("clamp"),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const forceRuleSchema = baseRuleSchema.extend({
  action: z.literal("force"),
  value: z.unknown(),
});

export const allowValuesRuleSchema = baseRuleSchema.extend({
  action: z.literal("allowValues"),
  values: z.array(z.unknown()).min(1),
});

export const denyValuesRuleSchema = baseRuleSchema.extend({
  action: z.literal("denyValues"),
  values: z.array(z.unknown()).min(1),
});

export const rejectWhenRuleSchema = baseRuleSchema.extend({
  action: z.literal("rejectWhen"),
  equals: z.unknown().optional(),
  in: z.array(z.unknown()).optional(),
  message: z.string().min(1),
});

export const policyRuleSchema = z.discriminatedUnion("action", [
  defaultRuleSchema,
  clampRuleSchema,
  forceRuleSchema,
  allowValuesRuleSchema,
  denyValuesRuleSchema,
  rejectWhenRuleSchema,
]);

export const policyRulesSchema = z.array(policyRuleSchema);

export const policyRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: policyScopeSchema,
  role: z.enum(["USER", "ADMIN"]).nullable(),
  userId: z.string().nullable(),
  priority: z.number().int(),
  enabled: z.boolean(),
  version: z.number().int(),
  rules: policyRulesSchema,
});

export const appliedPolicyRuleSchema = z.object({
  policyId: z.string(),
  ruleId: z.string(),
  field: z.string(),
  action: policyRuleActionSchema,
  before: z.unknown(),
  after: z.unknown(),
});

export const policyViolationSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
});

export const policyDecisionSchema = z.object({
  accepted: z.boolean(),
  normalizedParams: generationParamsSchema.nullable(),
  appliedRules: z.array(appliedPolicyRuleSchema),
  violations: z.array(policyViolationSchema),
  policyVersion: z.number().int(),
});

export const policyListResponseSchema = z.object({
  policies: z.array(policyRecordSchema),
});

export const policyPreviewRequestSchema = z.object({
  params: z.record(z.string(), z.unknown()),
  userId: z.string().optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
});

export type PolicyScope = z.infer<typeof policyScopeSchema>;
export type PolicyRule = z.infer<typeof policyRuleSchema>;
export type PolicyRecord = z.infer<typeof policyRecordSchema>;
export type PolicyListResponse = z.infer<typeof policyListResponseSchema>;
export type AppliedPolicyRule = z.infer<typeof appliedPolicyRuleSchema>;
export type PolicyViolation = z.infer<typeof policyViolationSchema>;
export type PolicyDecision = z.infer<typeof policyDecisionSchema>;
export type PolicyPreviewRequest = z.infer<typeof policyPreviewRequestSchema>;
