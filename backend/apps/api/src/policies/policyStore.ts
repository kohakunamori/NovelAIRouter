import type { ParameterPolicy } from "@prisma/client";
import { policyRecordSchema, type PolicyRecord } from "@novelai-router/shared";
import { prisma } from "../db.js";
import { parsePolicyRules } from "./policyEngine.js";

export function toPolicyRecord(policy: ParameterPolicy): PolicyRecord {
  return policyRecordSchema.parse({
    id: policy.id,
    name: policy.name,
    scope: policy.scope,
    role: policy.role,
    userId: policy.userId,
    priority: policy.priority,
    enabled: policy.enabled,
    version: policy.version,
    rules: parsePolicyRules(policy.rulesJson),
  });
}

export async function loadApplicablePolicies(userId: string, role: "USER" | "ADMIN") {
  const policies = await prisma.parameterPolicy.findMany({
    where: {
      enabled: true,
      OR: [
        { scope: "GLOBAL" },
        { scope: "ROLE", role },
        { scope: "USER", userId },
      ],
    },
  });

  return policies.map(toPolicyRecord);
}
