import type { PromptChunkLibrary } from "@/types/novelai"

export interface AdminApiErrorShape {
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message)
  }
}

export type UserRole = "USER" | "ADMIN"
export type UserStatus = "ACTIVE" | "DISABLED"

export interface AdminUser {
  id: string
  email: string
  role: UserRole
  status: UserStatus
  createdAt: string
}

export interface AuthResponse {
  user: AdminUser
}

export interface PlatformSettings {
  anlasMultiplier: number
  updatedAt: string
}

export interface GalleryOrder {
  seed: string
  updatedAt: string
}

export interface PromptChunkLibraryResponse {
  library: PromptChunkLibrary | null
  updatedAt: string | null
}

export interface UpdatePlatformSettingsRequest {
  anlasMultiplier: number
}

export interface BackendRuntimeConfig {
  generationConcurrency: number
  resultConsumerTimeoutMs: number
  assetUploadMaxBytes: number
  novelAiCredentialKeyVersion: number
  novelAiAccountLeaseTtlMs: number
  novelAiAccountLeaseHeartbeatMs: number
  novelAiAccountAcquireTimeoutMs: number
  novelAiAccountCooldownMs: number
  novelAiHttpTimeoutMs: number
  novelAiTestTimeoutMs: number
  novelAiProxyUrl: string | null
  novelAiHealthCheckUrl: string | null
  novelAiAdminHealthChecksEnabled: boolean
  novelAiSmokeTestsEnabled: boolean
  updatedAt: string
  credentialEncryption: {
    mode: "auto_file" | "env_override"
    keyPresent: boolean
  }
}

export interface UpdateBackendRuntimeConfigRequest {
  generationConcurrency?: number
  resultConsumerTimeoutMs?: number
  assetUploadMaxBytes?: number
  novelAiCredentialKeyVersion?: number
  novelAiAccountLeaseTtlMs?: number
  novelAiAccountLeaseHeartbeatMs?: number
  novelAiAccountAcquireTimeoutMs?: number
  novelAiAccountCooldownMs?: number
  novelAiHttpTimeoutMs?: number
  novelAiTestTimeoutMs?: number
  novelAiProxyUrl?: string | null
  novelAiHealthCheckUrl?: string | null
  novelAiAdminHealthChecksEnabled?: boolean
  novelAiSmokeTestsEnabled?: boolean
}

export interface GrantLedgerResponse {
  id: string
  userId: string
  type: string
  platformUnits: number
  balanceAfter: number
  createdAt: string
}

export interface UpdateAdminUserRequest {
  status?: UserStatus
  balance?: number
}

export interface DeleteAdminUserResponse {
  ok: true
}

export interface AdminPagination {
  page: number
  pageSize: number
  total: number
  pageCount: number
}

export interface AdminUserSummary {
  id: string
  email: string
  role: UserRole
  status: UserStatus
  balance: number
  createdAt: string
  updatedAt: string
  generationCount: number
}

export interface AdminUserListResponse {
  users: AdminUserSummary[]
}

export interface AdminLedgerEntry {
  id: string
  userId: string
  userEmail: string
  generationJobId: string | null
  type: string
  novelAiAnlas: number | null
  multiplier: number | null
  platformUnits: number
  balanceAfter: number
  createdByUserId: string | null
  createdByUserEmail: string | null
  createdAt: string
}

export interface AdminLedgerListResponse {
  entries: AdminLedgerEntry[]
  pagination: AdminPagination
}

export interface AdminJobListResponse {
  jobs: Array<{
    id: string
    status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"
    createdAt: string
    startedAt: string | null
    completedAt: string | null
    outputBytes: number
    intermediateOutputCount: number
    intermediateOutputSseBytes: number
    estimatedNovelAiAnlas: number | null
    actualNovelAiAnlas: number | null
    billedPlatformUnits: number | null
    outputCount: number
    resultMimeType: string | null
    errorCode: string | null
    errorMessage: string | null
    submittedParamsJson: unknown
    normalizedParamsJson: unknown | null
    user: AdminUserSummary
    upstreamAccount: {
      id: string
      label: string
      remoteAccountLabel: string | null
    } | null
  }>
  pagination: AdminPagination
}

export interface AdminJobDetailResponse {
  id: string
  status: string
  outputCount: number
  resultMimeType: string | null
  outputs: Array<{
    index: number
    asset: {
      id: string
      mimeType: string
      originalFilename: string | null
    }
  }>
}

export interface DeleteAdminJobsPageResponse {
  deletedCount: number
}

export interface NovelAiReadiness {
  readyForRealGeneration: boolean
  blockers: string[]
}

export interface AdminOverview {
  generatedAt: string
  readiness: NovelAiReadiness
  accounts: {
    total: number
    active: number
    disabled: number
    cooldown: number
    error: number
    leased: number
  }
  generations: {
    total: number
    last24h: number
    queued: number
    running: number
    succeeded: number
    failed: number
    cancelled: number
    totalTrackedAnlas: number
  }
  policies: {
    total: number
    enabled: number
    disabled: number
  }
  settings: PlatformSettings
  galleryOrder: GalleryOrder
  recentJobs: Array<{
    id: string
    status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"
    createdAt: string
    actualNovelAiAnlas: number | null
    estimatedNovelAiAnlas: number | null
    billedPlatformUnits: number | null
    novelAiAccountId: string | null
  }>
}

export type NovelAiCredentialKind = "API_TOKEN" | "SESSION_COOKIE" | "CUSTOM_JSON"
export type NovelAiAccountStatus = "ACTIVE" | "DISABLED" | "COOLDOWN" | "ERROR"

export interface NovelAiCredentialPayload {
  token?: string
  cookie?: string
  headers?: Record<string, string>
  notes?: string
}

export interface NovelAiAccountSummary {
  id: string
  label: string
  status: NovelAiAccountStatus
  credentialKind: NovelAiCredentialKind
  credentialKeyVersion: number
  credentialMetadata: {
    hasToken: boolean
    hasCookie: boolean
    headerNames: string[]
    notes: string | null
  }
  priority: number
  maxConcurrentJobs: number
  cooldownUntil: string | null
  lastUsedAt: string | null
  lastCheckedAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  failureCount: number
  lastErrorCode: string | null
  lastErrorMessage: string | null
  remoteAccountLabel: string | null
  remoteAnlasBalance: number | null
  remoteTier: number | null
  remoteActive: boolean | null
  remoteUnlimitedImageGeneration: boolean | null
  remoteMaxPriorityActions: number | null
  remoteFixedTrainingStepsLeft: number | null
  remotePurchasedTrainingSteps: number | null
  leased: boolean
  leasedGenerationJobId: string | null
  leaseTtlMs: number | null
  createdAt: string
  updatedAt: string
}

export interface NovelAiAccountPoolConfig {
  proxyConfigured: boolean
  healthChecksEnabled: boolean
  smokeTestsEnabled: boolean
  readiness: NovelAiReadiness
}

export interface NovelAiAccountListResponse {
  accounts: NovelAiAccountSummary[]
  config: NovelAiAccountPoolConfig
}

export interface CreateNovelAiAccountRequest {
  label: string
  credentialKind: NovelAiCredentialKind
  credential: NovelAiCredentialPayload
  priority: number
  maxConcurrentJobs: 1
}

export interface UpdateNovelAiAccountRequest {
  label?: string
  status?: NovelAiAccountStatus
  priority?: number
  maxConcurrentJobs?: 1
  cooldownUntil?: string | null
}

export interface RotateNovelAiCredentialRequest {
  credentialKind: NovelAiCredentialKind
  credential: NovelAiCredentialPayload
}

export type NovelAiAccountTestMode = "health_check" | "smoke_test"

export type TestNovelAiAccountRequest =
  | { mode: "health_check"; acknowledgeNetwork: true }
  | { mode: "smoke_test"; acknowledgeNetwork: true; acknowledgeAnlasSpend: true; confirmationText: "SPEND_ANLAS" }

export interface TestNovelAiAccountResponse {
  ok: boolean
  mode: NovelAiAccountTestMode
  message: string
  safety: {
    networkUsed: boolean
    credentialSent: boolean
    mayConsumeAnlas: boolean
    anlasConsumed: number | null
  }
  remote?: {
    accountLabel?: string | null
    anlasBalance?: number | null
    requestId?: string | null
    tier?: number | null
    active?: boolean | null
    unlimitedImageGeneration?: boolean | null
    maxPriorityActions?: number | null
    fixedTrainingStepsLeft?: number | null
    purchasedTrainingSteps?: number | null
  }
  account: NovelAiAccountSummary
}

export type PolicyScope = "GLOBAL" | "ROLE" | "USER"
export type PolicyAction = "default" | "clamp" | "force" | "allowValues" | "denyValues" | "rejectWhen"

export interface PolicyRuleBase {
  id: string
  field: string
  description?: string
}

export type PolicyRule =
  | (PolicyRuleBase & { action: "default"; value: unknown })
  | (PolicyRuleBase & { action: "clamp"; min?: number; max?: number })
  | (PolicyRuleBase & { action: "force"; value: unknown })
  | (PolicyRuleBase & { action: "allowValues"; values: unknown[] })
  | (PolicyRuleBase & { action: "denyValues"; values: unknown[] })
  | (PolicyRuleBase & { action: "rejectWhen"; equals?: unknown; in?: unknown[]; message: string })

export interface PolicyRecord {
  id: string
  name: string
  scope: PolicyScope
  role: UserRole | null
  userId: string | null
  priority: number
  enabled: boolean
  version: number
  rules: PolicyRule[]
}

export interface PolicyListResponse {
  policies: PolicyRecord[]
}

export interface CreatePolicyRequest {
  name: string
  scope: PolicyScope
  role?: UserRole | null
  userId?: string | null
  priority: number
  enabled: boolean
  rules: PolicyRule[]
}

export interface UpdatePolicyRequest {
  name?: string
  scope?: PolicyScope
  role?: UserRole | null
  userId?: string | null
  priority?: number
  enabled?: boolean
  rules?: PolicyRule[]
}

export interface PolicyPreviewRequest {
  params: Record<string, unknown>
  userId?: string
  role?: UserRole
}

export interface PolicyDecision {
  accepted: boolean
  normalizedParams: Record<string, unknown> | null
  appliedRules: Array<{
    policyId: string
    ruleId: string
    field: string
    action: PolicyAction
    before: unknown
    after: unknown
  }>
  violations: Array<{
    field: string
    code: string
    message: string
  }>
  policyVersion: number
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    return response.json()
  }

  const text = await response.text()
  return text ? { message: text } : null
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  })

  const body = await parseResponseBody(response)

  if (!response.ok) {
    const errorBody = typeof body === "object" && body !== null ? (body as AdminApiErrorShape) : undefined
    const message = errorBody?.error?.message ?? `Request failed with status ${response.status}`
    throw new AdminApiError(message, response.status, errorBody?.error?.code, errorBody?.error?.details)
  }

  return body as T
}

export function isAdminApiError(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError
}

export function getAdminApiErrorMessage(error: unknown) {
  if (error instanceof AdminApiError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Something went wrong"
}

export function getCurrentUser() {
  return requestJson<AuthResponse>("/api/auth/me")
}

export function login(input: { email: string; password: string }) {
  return requestJson<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function logout() {
  return requestJson<{ ok: true }>("/api/auth/logout", {
    method: "POST",
  })
}

export function getAdminOverview() {
  return requestJson<AdminOverview>("/api/admin/overview")
}

export function refreshAdminGalleryOrder() {
  return requestJson<GalleryOrder>("/api/admin/overview/gallery-order/refresh", {
    method: "POST",
  })
}

export function getPromptChunkLibrary() {
  return requestJson<PromptChunkLibraryResponse>("/api/user-settings/prompt-chunks")
}

export function updatePromptChunkLibrary(input: PromptChunkLibrary) {
  return requestJson<PromptChunkLibraryResponse>("/api/user-settings/prompt-chunks", {
    method: "PUT",
    body: JSON.stringify(input),
  })
}

export function getAdminSettings() {
  return requestJson<PlatformSettings>("/api/admin/settings")
}

export function updateAdminSettings(input: UpdatePlatformSettingsRequest) {
  return requestJson<PlatformSettings>("/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function getAdminUsers() {
  return requestJson<AdminUserListResponse>("/api/admin/users")
}

export function getAdminJobs(input: { page: number; pageSize: number; userId?: string; novelAiAccountId?: string }) {
  const params: Record<string, string> = {
    page: String(input.page),
    pageSize: String(input.pageSize),
  }
  if (input.userId) {
    params.userId = input.userId
  }
  if (input.novelAiAccountId) {
    params.novelAiAccountId = input.novelAiAccountId
  }
  const search = new URLSearchParams(params)
  return requestJson<AdminJobListResponse>(`/api/admin/jobs?${search.toString()}`)
}

export function getAdminJobDetail(jobId: string) {
  return requestJson<AdminJobDetailResponse>(`/api/admin/jobs/${encodeURIComponent(jobId)}`)
}

export function deleteAdminJobsPage(input: { page: number; pageSize: number }) {
  return requestJson<DeleteAdminJobsPageResponse>("/api/admin/jobs/delete-page", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function deleteAdminJob(jobId: string) {
  return requestJson<DeleteAdminJobsPageResponse>(`/api/admin/jobs/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
  })
}

export function getAdminLedger(input: { page: number; pageSize: number }) {
  const search = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  })
  return requestJson<AdminLedgerListResponse>(`/api/admin/ledger?${search.toString()}`)
}

export function grantLedger(input: { userId: string; platformUnits: number }) {
  return requestJson<GrantLedgerResponse>(`/api/admin/users/${input.userId}/ledger/grant`, {
    method: "POST",
    body: JSON.stringify({ platformUnits: input.platformUnits }),
  })
}

export function updateAdminUser(userId: string, input: UpdateAdminUserRequest) {
  return requestJson<AdminUserSummary>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteAdminUser(userId: string) {
  return requestJson<DeleteAdminUserResponse>(`/api/admin/users/${userId}`, {
    method: "DELETE",
  })
}

export function getAdminRuntimeConfig() {
  return requestJson<BackendRuntimeConfig>("/api/admin/runtime-config")
}

export function updateAdminRuntimeConfig(input: UpdateBackendRuntimeConfigRequest) {
  return requestJson<BackendRuntimeConfig>("/api/admin/runtime-config", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function getAdminAccounts() {
  return requestJson<NovelAiAccountListResponse>("/api/admin/novelai/accounts")
}

export function createAdminAccount(input: CreateNovelAiAccountRequest) {
  return requestJson<NovelAiAccountSummary>("/api/admin/novelai/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateAdminAccount(accountId: string, input: UpdateNovelAiAccountRequest) {
  return requestJson<NovelAiAccountSummary>(`/api/admin/novelai/accounts/${accountId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteAdminAccount(accountId: string) {
  return requestJson<{ ok: true }>(`/api/admin/novelai/accounts/${accountId}`, {
    method: "DELETE",
  })
}

export function rotateAdminAccountCredential(accountId: string, input: RotateNovelAiCredentialRequest) {
  return requestJson<NovelAiAccountSummary>(`/api/admin/novelai/accounts/${accountId}/rotate-credential`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function setAdminAccountEnabled(accountId: string, enabled: boolean) {
  return requestJson<NovelAiAccountSummary>(`/api/admin/novelai/accounts/${accountId}/${enabled ? "enable" : "disable"}`, {
    method: "POST",
  })
}

export function testAdminAccount(accountId: string, input: TestNovelAiAccountRequest) {
  return requestJson<TestNovelAiAccountResponse>(`/api/admin/novelai/accounts/${accountId}/test`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getAdminPolicies() {
  return requestJson<PolicyListResponse>("/api/admin/policies")
}

export function createAdminPolicy(input: CreatePolicyRequest) {
  return requestJson<PolicyRecord>("/api/admin/policies", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateAdminPolicy(policyId: string, input: UpdatePolicyRequest) {
  return requestJson<PolicyRecord>(`/api/admin/policies/${policyId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function disableAdminPolicy(policyId: string) {
  return requestJson<PolicyRecord>(`/api/admin/policies/${policyId}/disable`, {
    method: "POST",
  })
}

export function previewAdminPolicy(input: PolicyPreviewRequest) {
  return requestJson<PolicyDecision>("/api/admin/policies/preview", {
    method: "POST",
    body: JSON.stringify(input),
  })
}
