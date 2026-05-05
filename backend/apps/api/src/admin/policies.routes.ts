import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  policyPreviewRequestSchema,
  policyRecordSchema,
  policyRulesSchema,
  policyScopeSchema,
  userRoleSchema,
} from "@novelai-router/shared";
import { currentUser, requireAdmin } from "../auth/guards.js";
import { prisma } from "../db.js";
import { applyParameterPolicies } from "../policies/policyEngine.js";
import { loadApplicablePolicies, toPolicyRecord } from "../policies/policyStore.js";

const policyIdParamsSchema = z.object({ policyId: z.string().min(1) });

const policyBodySchema = z.object({
  name: z.string().trim().min(1),
  scope: policyScopeSchema,
  role: userRoleSchema.nullable().optional(),
  userId: z.string().nullable().optional(),
  priority: z.coerce.number().int().default(0),
  enabled: z.boolean().default(true),
  rules: policyRulesSchema,
});

const updatePolicyBodySchema = policyBodySchema.partial().extend({
  rules: policyRulesSchema.optional(),
});

export async function policiesRoutes(app: FastifyInstance) {
  app.get("/api/admin/policies", { preHandler: requireAdmin }, async () => {
    const policies = await prisma.parameterPolicy.findMany({ orderBy: [{ scope: "asc" }, { priority: "asc" }] });
    return { policies: policies.map(toPolicyRecord) };
  });

  app.post("/api/admin/policies", { preHandler: requireAdmin }, async (request) => {
    const body = policyBodySchema.parse(request.body);
    const admin = currentUser(request);
    const policy = await prisma.parameterPolicy.create({
      data: {
        name: body.name,
        scope: body.scope,
        role: body.role ?? null,
        userId: body.userId ?? null,
        priority: body.priority,
        enabled: body.enabled,
        rulesJson: body.rules as Prisma.InputJsonValue,
        createdByUserId: admin.id,
      },
    });
    return policyRecordSchema.parse(toPolicyRecord(policy));
  });

  app.patch("/api/admin/policies/:policyId", { preHandler: requireAdmin }, async (request) => {
    const params = policyIdParamsSchema.parse(request.params);
    const body = updatePolicyBodySchema.parse(request.body);
    const policy = await prisma.parameterPolicy.update({
      where: { id: params.policyId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.scope !== undefined ? { scope: body.scope } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.userId !== undefined ? { userId: body.userId } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.rules !== undefined ? { rulesJson: body.rules as Prisma.InputJsonValue } : {}),
        version: { increment: 1 },
      },
    });
    return policyRecordSchema.parse(toPolicyRecord(policy));
  });

  app.post("/api/admin/policies/:policyId/disable", { preHandler: requireAdmin }, async (request) => {
    const params = policyIdParamsSchema.parse(request.params);
    const policy = await prisma.parameterPolicy.update({
      where: { id: params.policyId },
      data: { enabled: false, version: { increment: 1 } },
    });
    return policyRecordSchema.parse(toPolicyRecord(policy));
  });

  app.post("/api/admin/policies/preview", { preHandler: requireAdmin }, async (request) => {
    const body = policyPreviewRequestSchema.parse(request.body);
    const admin = currentUser(request);
    const role = body.role ?? admin.role;
    const userId = body.userId ?? admin.id;
    const policies = await loadApplicablePolicies(userId, role);
    return applyParameterPolicies(body.params, policies, { userId, role });
  });
}
