import {
  generationParamsSchema,
  generationRequestSchema,
  normalizeGenerationRequest,
  policyDecisionSchema,
  policyRulesSchema,
  type AppliedPolicyRule,
  type GenerationParams,
  type GenerationRequest,
  type PolicyDecision,
  type PolicyRecord,
  type PolicyRule,
  type PolicyViolation,
} from "@novelai-router/shared";

export type PolicyContext = {
  userId: string;
  role: "USER" | "ADMIN";
};

const scopeRank = {
  GLOBAL: 0,
  ROLE: 1,
  USER: 2,
} as const;

export function parsePolicyRules(value: unknown) {
  return policyRulesSchema.parse(value);
}

export function applyParameterPolicies(
  rawParams: unknown,
  policies: PolicyRecord[],
  _context: PolicyContext,
): PolicyDecision {
  const request = generationRequestSchema.safeParse(rawParams);
  if (!request.success) {
    return policyDecisionSchema.parse({
      accepted: false,
      normalizedParams: null,
      appliedRules: [],
      violations: request.error.issues.map((issue) => ({
        field: issue.path.join("."),
        code: "VALIDATION_ERROR",
        message: issue.message,
      })),
      policyVersion: maxPolicyVersion(policies),
    });
  }

  const params = cloneRequest(request.data);
  const appliedRules: AppliedPolicyRule[] = [];
  const violations: PolicyViolation[] = [];

  for (const policy of sortPolicies(policies)) {
    for (const rule of policy.rules) {
      applyRule(policy.id, rule, params, appliedRules, violations);
    }
  }

  let normalizedParams: GenerationParams | null = null;
  if (violations.length === 0) {
    const normalized = generationParamsSchema.safeParse(normalizeGenerationRequest(params));
    if (!normalized.success) {
      violations.push(
        ...normalized.error.issues.map((issue) => ({
          field: issue.path.join("."),
          code: "PARAMETER_INVARIANT_FAILED",
          message: issue.message,
        })),
      );
    } else {
      normalizedParams = normalized.data;
    }
  }

  return policyDecisionSchema.parse({
    accepted: violations.length === 0,
    normalizedParams,
    appliedRules,
    violations,
    policyVersion: maxPolicyVersion(policies),
  });
}

function sortPolicies(policies: PolicyRecord[]) {
  return [...policies].sort((a, b) => {
    const scopeDelta = scopeRank[a.scope] - scopeRank[b.scope];
    if (scopeDelta !== 0) return scopeDelta;
    return a.priority - b.priority;
  });
}

function maxPolicyVersion(policies: PolicyRecord[]) {
  return policies.reduce((max, policy) => Math.max(max, policy.version), 0);
}

function applyRule(
  policyId: string,
  rule: PolicyRule,
  params: Record<string, unknown>,
  appliedRules: AppliedPolicyRule[],
  violations: PolicyViolation[],
) {
  const before = getPathValue(params, rule.field);

  if (rule.action === "default") {
    if (before === undefined) {
      setPathValue(params, rule.field, rule.value);
      record(policyId, rule, before, getPathValue(params, rule.field), appliedRules);
    }
    return;
  }

  if (rule.action === "force") {
    if (!valuesEqual(before, rule.value)) {
      setPathValue(params, rule.field, rule.value);
      record(policyId, rule, before, getPathValue(params, rule.field), appliedRules);
    }
    return;
  }

  if (rule.action === "clamp") {
    if (typeof before !== "number") return;
    let after = before;
    if (rule.min !== undefined) after = Math.max(after, rule.min);
    if (rule.max !== undefined) after = Math.min(after, rule.max);
    if (after !== before) {
      setPathValue(params, rule.field, after);
      record(policyId, rule, before, after, appliedRules);
    }
    return;
  }

  if (rule.action === "allowValues") {
    if (!rule.values.some((value) => valuesEqual(value, before))) {
      violations.push({
        field: rule.field,
        code: "VALUE_NOT_ALLOWED",
        message: `${rule.field} is not allowed`,
      });
    }
    return;
  }

  if (rule.action === "denyValues") {
    if (rule.values.some((value) => valuesEqual(value, before))) {
      violations.push({
        field: rule.field,
        code: "VALUE_DENIED",
        message: `${rule.field} is denied`,
      });
    }
    return;
  }

  if (rule.action === "rejectWhen") {
    const equalsMatch = "equals" in rule && valuesEqual(rule.equals, before);
    const inMatch = "in" in rule && Array.isArray(rule.in) && rule.in.some((value) => valuesEqual(value, before));
    if (equalsMatch || inMatch) {
      violations.push({ field: rule.field, code: "REJECTED_BY_POLICY", message: rule.message });
    }
  }
}

function record(
  policyId: string,
  rule: PolicyRule,
  before: unknown,
  after: unknown,
  appliedRules: AppliedPolicyRule[],
) {
  appliedRules.push({
    policyId,
    ruleId: rule.id,
    field: rule.field,
    action: rule.action,
    before,
    after,
  });
}

function valuesEqual(left: unknown, right: unknown) {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function getPathValue(target: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, target);
}

function setPathValue(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return;

  let current: unknown = target;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextSegment = segments[index + 1];
    if (!segment || !nextSegment) return;

    const shouldCreateArray = isArrayIndexSegment(nextSegment);

    if (Array.isArray(current)) {
      if (!isArrayIndexSegment(segment)) return;
      const arrayIndex = Number.parseInt(segment, 10);
      const existing = current[arrayIndex];
      if (!existing || typeof existing !== "object") {
        current[arrayIndex] = shouldCreateArray ? [] : {};
      }
      current = current[arrayIndex];
      continue;
    }

    if (!current || typeof current !== "object") return;
    const record = current as Record<string, unknown>;
    const existing = record[segment];
    if (!existing || typeof existing !== "object") {
      record[segment] = shouldCreateArray ? [] : {};
    }
    current = record[segment];
  }

  const finalSegment = segments.at(-1) ?? path;
  if (Array.isArray(current)) {
    if (!isArrayIndexSegment(finalSegment)) return;
    current[Number.parseInt(finalSegment, 10)] = value;
    return;
  }

  if (!current || typeof current !== "object") return;
  (current as Record<string, unknown>)[finalSegment] = value;
}

function isArrayIndexSegment(segment: string) {
  return /^\d+$/.test(segment);
}

function cloneRequest(request: GenerationRequest) {
  return JSON.parse(JSON.stringify(request)) as Record<string, unknown> as GenerationRequest;
}

export function ensureGenerationParams(params: unknown): GenerationParams {
  return generationParamsSchema.parse(params);
}
