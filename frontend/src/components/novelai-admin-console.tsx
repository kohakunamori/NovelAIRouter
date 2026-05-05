"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"

import Link from "next/link"

import { ChartNoAxesColumn, ChevronDown, KeyRound, ScanSearch, Settings2, ShieldCheck, Trash2, UserRound, Wallet } from "lucide-react"

import { FloatingFeedbackPanel } from "@/components/floating-feedback-panel"

import {
  createAdminAccount,
  createAdminPolicy,
  deleteAdminAccount,
  deleteAdminJob,
  deleteAdminJobsPage,
  deleteAdminUser,
  disableAdminPolicy,
  getAdminAccounts,
  getAdminApiErrorMessage,
  getAdminJobDetail,
  getAdminJobs,
  getAdminOverview,
  getAdminPolicies,
  getAdminRuntimeConfig,
  getAdminUsers,
  getCurrentUser,
  isAdminApiError,
  login,
  logout,
  previewAdminPolicy,
  refreshAdminGalleryOrder,
  setAdminAccountEnabled,
  testAdminAccount,
  updateAdminAccount,
  updateAdminPolicy,
  updateAdminRuntimeConfig,
  updateAdminSettings,
  updateAdminUser,
  type AdminJobDetailResponse,
  type AdminJobListResponse,
  type AdminOverview,
  type AdminUser,
  type AdminUserListResponse,
  type BackendRuntimeConfig,
  type CreateNovelAiAccountRequest,
  type CreatePolicyRequest,
  type NovelAiAccountListResponse,
  type NovelAiAccountSummary,
  type NovelAiCredentialKind,
  type NovelAiCredentialPayload,
  type PlatformSettings,
  type PolicyDecision,
  type PolicyRecord,
  type PolicyRule,
  type PolicyScope,
  type UpdatePolicyRequest,
  type UserRole,
} from "@/lib/novelai-admin-api"
import { useNovelAIUiLanguage, type NovelAIUiLanguage } from "@/lib/novelai-ui-language"
import { cn } from "@/lib/utils"

const adminShellClassName = "min-h-screen overflow-y-auto bg-[rgb(13,15,31)] text-white"
const cardClassName = "rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] shadow-[0_10px_30px_rgba(0,0,0,0.2)]"
const fieldClassName = "w-full rounded-[3px] border border-[rgb(46,50,82)] bg-[rgb(19,21,44)] px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-[rgb(245,243,194)]"
const labelClassName = "text-[12px] font-semibold uppercase tracking-[0.08em] text-white/60"
const subtleTextClassName = "text-sm text-white/60"

type AdminSection = "overview" | "jobs" | "account" | "upstream-accounts" | "other-settings" | "policies" | "policy-preview"

const adminPageSizeOptions = [10, 20, 50, 100] as const

const adminZhTranslations: Record<string, string> = {
  "Account": "账户",
  "Account settings": "账户设置",
  "Accounts": "账户",
  "Active": "启用",
  "Admin Console": "管理控制台",
  "Admin Page": "管理后台",
  "Admin role required": "需要管理员角色",
  "All upstream accounts": "全部上游账户",
  "All users": "全部用户",
  "Anlas / Platform units": "Anlas / 平台点数",
  "Anlas multiplier": "Anlas 倍率",
  "Auto-managed file": "自动管理文件",
  "Back to workspace": "返回工作区",
  "Backend readiness": "后端就绪状态",
  "Balance": "余额",
  "Checking…": "检查中…",
  "Checking your admin session…": "正在检查管理员会话…",
  "Clear filters": "清除筛选",
  "Close": "关闭",
  "Collapse": "收起",
  "Cookie": "Cookie",
  "Cooldown until": "冷却至",
  "Create policy": "创建策略",
  "Create upstream account": "创建上游账户",
  "Created": "创建时间",
  "Creating…": "创建中…",
  "Credential encryption": "凭据加密",
  "Credential kind": "凭据类型",
  "Current admin role": "当前管理员角色",
  "Current balance": "当前余额",
  "Dashboard": "仪表盘",
  "Decision": "决策结果",
  "Delete": "删除",
  "Delete account": "删除账户",
  "Delete current page": "删除当前页",
  "Delete job": "删除任务",
  "Deleting…": "删除中…",
  "Disable": "禁用",
  "Disable account": "禁用账户",
  "Disabling…": "正在禁用…",
  "Edit and disable existing policies": "编辑并禁用现有策略",
  "Email": "邮箱",
  "Enable": "启用",
  "Enable account": "启用账户",
  "Enabled": "已启用",
  "Enabling…": "正在启用…",
  "Enter admin password": "输入管理员密码",
  "Environment override": "环境变量覆盖",
  "Error": "错误",
  "Error code": "错误代码",
  "Error message": "错误消息",
  "Expand": "展开",
  "FAILED job reason": "失败任务原因",
  "Frontend gallery": "前端图库",
  "Generations": "生成",
  "Governance": "治理",
  "Headers JSON": "请求头 JSON",
  "Health": "健康状态",
  "Health check": "健康检查",
  "Healthy": "健康",
  "Job": "任务",
  "Jobs": "任务",
  "Key source": "密钥来源",
  "Label": "标签",
  "Last checked": "最后检查",
  "Last failure": "最后失败",
  "Last success": "最后成功",
  "Last used": "最后使用",
  "Lease job": "租用任务",
  "Leased": "已租用",
  "Loading jobs…": "正在加载任务…",
  "Loading readiness…": "正在加载就绪状态…",
  "Loading results…": "正在加载结果…",
  "Loading runtime settings…": "正在加载运行设置…",
  "Managed secrets": "托管密钥",
  "Manage Account": "管理账户",
  "Missing": "缺失",
  "Name": "名称",
  "Next": "下一页",
  "No": "否",
  "No jobs yet.": "暂无任务。",
  "No output images": "没有输出图片",
  "No policies found.": "未找到策略。",
  "No upstream accounts configured.": "尚未配置上游账户。",
  "No users yet.": "暂无用户。",
  "None": "无",
  "Notes": "备注",
  "NovelAI Router Admin": "NovelAI 路由管理后台",
  "Optional API token": "可选 API 令牌",
  "Optional session cookie": "可选会话 Cookie",
  "Overview": "总览",
  "Page": "页",
  "Params": "参数",
  "Params JSON": "参数 JSON",
  "Password": "密码",
  "Performance": "性能",
  "Performance settings": "性能设置",
  "Platform settings": "平台设置",
  "Policies": "策略",
  "Policy Preview": "策略预览",
  "Policy preview": "策略预览",
  "Previous": "上一页",
  "Previewing…": "预览中…",
  "Priority": "优先级",
  "Ready": "就绪",
  "Refresh": "刷新",
  "Refresh gallery order": "刷新图库顺序",
  "Refreshing…": "正在刷新…",
  "Remaining Anlas": "剩余 Anlas",
  "Role": "角色",
  "Role override": "角色覆盖",
  "Rows": "行数",
  "Rules JSON": "规则 JSON",
  "Run preview": "运行预览",
  "SUCCEEDED job results": "成功任务结果",
  "Save account": "保存账户",
  "Save performance settings": "保存性能设置",
  "Save policy": "保存策略",
  "Save settings": "保存设置",
  "Saving…": "保存中…",
  "Scope": "范围",
  "Set balance": "设置余额",
  "Sign in": "登录",
  "Sign out": "退出登录",
  "Signing in…": "登录中…",
  "Signing out…": "退出中…",
  "Status": "状态",
  "Tier": "等级",
  "Token": "令牌",
  "Total generation concurrency": "总生成并发数",
  "Tracked Anlas": "已跟踪 Anlas",
  "Unavailable": "不可用",
  "Unknown": "未知",
  "Unknown account error": "未知账户错误",
  "Updated —": "更新于 —",
  "Updating…": "更新中…",
  "Upstream Account": "上游账户",
  "Upstream account": "上游账户",
  "Upstream accounts": "上游账户",
  "User": "用户",
  "User ID": "用户 ID",
  "User ID override": "用户 ID 覆盖",
  "User account": "用户账户",
  "User accounts": "用户账户",
  "View params": "查看参数",
  "Workspace": "工作区",
  "Yes": "是",
}

type AdminTranslator = (text: string) => string

function createAdminTranslator(language: NovelAIUiLanguage): AdminTranslator {
  return (text) => language === "zh" ? adminZhTranslations[text] ?? text : text
}

function formatAdminBoolean(value: boolean, language: NovelAIUiLanguage) {
  return language === "zh" ? (value ? "是" : "否") : value ? "Yes" : "No"
}

function formatUserRole(role: UserRole, language: NovelAIUiLanguage) {
  if (language !== "zh") {
    return role
  }

  return role === "ADMIN" ? "管理员" : "用户"
}

function formatUserStatus(status: "ACTIVE" | "DISABLED", language: NovelAIUiLanguage) {
  if (language !== "zh") {
    return status
  }

  return status === "ACTIVE" ? "启用" : "禁用"
}

function formatUpstreamAccountStatus(status: NovelAiAccountSummary["status"], language: NovelAIUiLanguage) {
  if (language !== "zh") {
    return status
  }

  const statusMap = {
    ACTIVE: "启用",
    COOLDOWN: "冷却中",
    DISABLED: "禁用",
    ERROR: "错误",
  } satisfies Record<NovelAiAccountSummary["status"], string>

  return statusMap[status]
}

function formatJobStatus(status: AdminJobListResponse["jobs"][number]["status"], language: NovelAIUiLanguage) {
  if (language !== "zh") {
    return status
  }

  const statusMap = {
    CANCELLED: "已取消",
    FAILED: "失败",
    QUEUED: "排队中",
    RUNNING: "运行中",
    SUCCEEDED: "成功",
  } satisfies Record<AdminJobListResponse["jobs"][number]["status"], string>

  return statusMap[status]
}

function formatNovelAiCredentialKind(kind: NovelAiCredentialKind, language: NovelAIUiLanguage) {
  if (language !== "zh") {
    return kind
  }

  const kindMap = {
    API_TOKEN: "API 令牌",
    CUSTOM_JSON: "自定义 JSON",
    SESSION_COOKIE: "会话 Cookie",
  } satisfies Record<NovelAiCredentialKind, string>

  return kindMap[kind]
}

function formatPolicyScope(scope: PolicyScope, language: NovelAIUiLanguage) {
  if (language !== "zh") {
    return scope
  }

  const scopeMap = {
    GLOBAL: "全局",
    ROLE: "角色",
    USER: "用户",
  } satisfies Record<PolicyScope, string>

  return scopeMap[scope]
}

export function NovelAIAdminConsole() {
  const [authLoading, setAuthLoading] = useState(true)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [user, setUser] = useState<AdminUser | null>(null)
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [runtimeConfig, setRuntimeConfig] = useState<BackendRuntimeConfig | null>(null)
  const [accountsResponse, setAccountsResponse] = useState<NovelAiAccountListResponse | null>(null)
  const [jobsResponse, setJobsResponse] = useState<AdminJobListResponse | null>(null)
  const [usersResponse, setUsersResponse] = useState<AdminUserListResponse | null>(null)
  const [policies, setPolicies] = useState<PolicyRecord[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)
  const [loginForm, setLoginForm] = useState({ email: "", password: "" })
  const [settingsMultiplier, setSettingsMultiplier] = useState("1.5")
  const [runtimeConfigForm, setRuntimeConfigForm] = useState({
    generationConcurrency: "1",
    resultConsumerTimeoutMs: "30000",
    assetUploadMaxBytes: "15728640",
    novelAiCredentialKeyVersion: "1",
    novelAiAccountLeaseTtlMs: "120000",
    novelAiAccountLeaseHeartbeatMs: "30000",
    novelAiAccountAcquireTimeoutMs: "10000",
    novelAiAccountCooldownMs: "300000",
    novelAiHttpTimeoutMs: "120000",
    novelAiTestTimeoutMs: "10000",
    novelAiProxyUrl: "",
    novelAiAdminHealthChecksEnabled: true,
    novelAiSmokeTestsEnabled: false,
  })
  const [jobsPage, setJobsPage] = useState(1)
  const [jobsPageSize, setJobsPageSize] = useState<(typeof adminPageSizeOptions)[number]>(20)
  const [jobsFilterUserId, setJobsFilterUserId] = useState("")
  const [jobsFilterUpstreamAccountId, setJobsFilterUpstreamAccountId] = useState("")
  const [userRows, setUserRows] = useState<(typeof adminPageSizeOptions)[number]>(20)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [manageBalance, setManageBalance] = useState("")
  const [createAccountForm, setCreateAccountForm] = useState({
    label: "",
    credentialKind: "API_TOKEN" as NovelAiCredentialKind,
    token: "",
    cookie: "",
    headersJson: "{}",
    notes: "",
    priority: "0",
  })
  const [createPolicyForm, setCreatePolicyForm] = useState({
    name: "",
    scope: "GLOBAL" as PolicyScope,
    role: "" as "" | UserRole,
    userId: "",
    priority: "0",
    enabled: true,
    rulesJson: JSON.stringify(defaultPolicyRules, null, 2),
  })
  const [previewForm, setPreviewForm] = useState({
    paramsJson: JSON.stringify(defaultPreviewParams, null, 2),
    role: "" as "" | UserRole,
    userId: "",
  })
  const [previewDecision, setPreviewDecision] = useState<PolicyDecision | null>(null)
  const [selectedFailedJob, setSelectedFailedJob] = useState<{ id: string; errorCode: string | null; errorMessage: string | null } | null>(null)
  const [succeededJobDetail, setSucceededJobDetail] = useState<AdminJobDetailResponse | null>(null)
  const [isLoadingJobDetail, setIsLoadingJobDetail] = useState(false)
  const [pendingKeys, setPendingKeys] = useState<string[]>([])
  const [activeSection, setActiveSection] = useState<AdminSection>("overview")
  const mainContentRef = useRef<HTMLElement | null>(null)
  const { language } = useNovelAIUiLanguage()
  const t = useMemo(() => createAdminTranslator(language), [language])

  const isAdmin = user?.role === "ADMIN"
  const accounts = useMemo(() => accountsResponse?.accounts ?? [], [accountsResponse])
  const jobs = useMemo(() => jobsResponse?.jobs ?? [], [jobsResponse])
  const bandwidthEstimate = useMemo(() => calculateBandwidthEstimate(jobs), [jobs])
  const users = useMemo(() => usersResponse?.users ?? [], [usersResponse])
  const visibleUsers = useMemo(() => users.slice(0, userRows), [userRows, users])
  const accountConfig = accountsResponse?.config ?? null
  const selectedManageUser = users.find((entry) => entry.id === selectedUserId) ?? null
  const showCreateAccountTokenField = createAccountForm.credentialKind === "API_TOKEN"
  const showCreateAccountCookieField = createAccountForm.credentialKind === "SESSION_COOKIE"
  const showCreateAccountHeadersField = createAccountForm.credentialKind === "CUSTOM_JSON"

  const isPending = useCallback((key: string) => pendingKeys.includes(key), [pendingKeys])

  const runWithPending = useCallback(async (key: string, task: () => Promise<void>) => {
    setPendingKeys((current) => (current.includes(key) ? current : [...current, key]))

    try {
      await task()
    } finally {
      setPendingKeys((current) => current.filter((item) => item !== key))
    }
  }, [])

  const loadAuth = useCallback(async () => {
    setAuthLoading(true)

    try {
      const response = await getCurrentUser()
      setUser(response.user)
    } catch (error) {
      if (isAdminApiError(error) && error.status === 401) {
        setUser(null)
      } else {
        setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
      }
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const loadOverviewAndSettings = useCallback(async () => {
    const nextOverview = await getAdminOverview()
    setOverview(nextOverview)
    setSettings(nextOverview.settings)
    setSettingsMultiplier(String(nextOverview.settings.anlasMultiplier))
  }, [])

  const loadAccounts = useCallback(async () => {
    const nextAccounts = await getAdminAccounts()
    setAccountsResponse(nextAccounts)
  }, [])

  const loadJobs = useCallback(async (page: number, pageSize: number, userId?: string, novelAiAccountId?: string) => {
    const nextJobs = await getAdminJobs({ page, pageSize, userId, novelAiAccountId })
    setJobsResponse(nextJobs)
    return nextJobs
  }, [])

  const loadUsers = useCallback(async () => {
    const nextUsers = await getAdminUsers()
    setUsersResponse(nextUsers)
    setSelectedUserId((current) => {
      if (nextUsers.users.some((entry) => entry.id === current)) {
        return current
      }

      return nextUsers.users[0]?.id ?? ""
    })
  }, [])

  const loadRuntimeConfig = useCallback(async () => {
    const nextRuntimeConfig = await getAdminRuntimeConfig()
    setRuntimeConfig(nextRuntimeConfig)
    setRuntimeConfigForm(toRuntimeConfigForm(nextRuntimeConfig))
  }, [])

  const loadPolicies = useCallback(async () => {
    const nextPolicies = await getAdminPolicies()
    setPolicies(nextPolicies.policies)
  }, [])

  useEffect(() => {
    if (!users.length) {
      setManageBalance("")
      return
    }

    const selected = users.find((entry) => entry.id === selectedUserId)
    if (selected) {
      setManageBalance(String(selected.balance))
    }
  }, [selectedUserId, users])

  const loadAdminData = useCallback(async () => {
    setDataLoading(true)

    try {
      await Promise.all([
        loadOverviewAndSettings(),
        loadAccounts(),
        loadUsers(),
        loadRuntimeConfig(),
        loadPolicies(),
        loadJobs(jobsPage, jobsPageSize, jobsFilterUserId || undefined, jobsFilterUpstreamAccountId || undefined),
      ])
    } catch (error) {
      setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
    } finally {
      setDataLoading(false)
    }
  }, [loadAccounts, loadJobs, loadOverviewAndSettings, loadPolicies, loadRuntimeConfig, loadUsers, jobsPage, jobsPageSize, jobsFilterUserId, jobsFilterUpstreamAccountId])

  useEffect(() => {
    void loadAuth()
  }, [loadAuth])

  useEffect(() => {
    if (authLoading || !isAdmin) {
      return
    }

    void loadAdminData()
  }, [authLoading, isAdmin, loadAdminData])

  useEffect(() => {
    setJobsPage(1)
  }, [jobsFilterUserId, jobsFilterUpstreamAccountId])

  useEffect(() => {
    if (authLoading || !isAdmin) {
      return
    }

    void loadJobs(jobsPage, jobsPageSize, jobsFilterUserId || undefined, jobsFilterUpstreamAccountId || undefined).catch((error) => {
      setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
    })
  }, [authLoading, isAdmin, jobsPage, jobsPageSize, jobsFilterUserId, jobsFilterUpstreamAccountId, loadJobs])

  useEffect(() => {
    if (!message) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setMessage(null)
    }, 3200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [message])

  const readinessCards = useMemo(() => {
    if (!overview) {
      return []
    }

    return [
      {
        label: t("Accounts"),
        value: overview.accounts.total,
        secondary: language === "zh" ? `${overview.accounts.active} 个启用 · ${overview.accounts.leased} 个占用` : `${overview.accounts.active} active · ${overview.accounts.leased} leased`,
      },
      {
        label: t("Generations"),
        value: overview.generations.total,
        secondary: language === "zh" ? `过去 24 小时 ${overview.generations.last24h} 次` : `${overview.generations.last24h} in last 24h`,
      },
      {
        label: t("Policies"),
        value: overview.policies.total,
        secondary: language === "zh" ? `${overview.policies.enabled} 条启用` : `${overview.policies.enabled} enabled`,
      },
      {
        label: t("Tracked Anlas"),
        value: overview.generations.totalTrackedAnlas,
        secondary: language === "zh" ? `${overview.generations.succeeded} 个成功任务` : `${overview.generations.succeeded} successful jobs`,
      },
    ]
  }, [language, overview, t])

  const handleSelectSection = useCallback((section: AdminSection) => {
    setActiveSection(section)
    mainContentRef.current?.scrollTo({ top: 0 })
  }, [])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthSubmitting(true)
    setMessage(null)

    try {
      const response = await login(loginForm)
      setUser(response.user)
      setLoginForm((current) => ({ ...current, password: "" }))
    } catch (error) {
      setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleLogout = async () => {
    setMessage(null)

    await runWithPending("logout", async () => {
      try {
        await logout()
        setUser(null)
        setOverview(null)
        setSettings(null)
        setRuntimeConfig(null)
        setAccountsResponse(null)
        setPolicies([])
        setPreviewDecision(null)
        setMessage({ tone: "success", text: language === "zh" ? "已退出登录。" : "Signed out." })
      } catch (error) {
        setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
      }
    })
  }

  const handleRefresh = async () => {
    setMessage(null)

    await runWithPending("refresh", async () => {
      await loadAdminData()
      setMessage({ tone: "success", text: language === "zh" ? "管理数据已刷新。" : "Admin data refreshed." })
    })
  }

  const handleRefreshGalleryOrder = async () => {
    setMessage(null)

    await runWithPending("gallery-order", async () => {
      try {
        const galleryOrder = await refreshAdminGalleryOrder()
        setOverview((current) => current ? { ...current, galleryOrder } : current)
        setMessage({ tone: "success", text: language === "zh" ? "前端图库顺序已刷新。" : "Frontend gallery order refreshed." })
      } catch (error) {
        setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
      }
    })
  }

  const handleDeleteCurrentJobsPage = async () => {
    if (jobs.length === 0) {
      setMessage({ tone: "success", text: language === "zh" ? "当前页面没有可删除的任务。" : "There are no jobs on this page to delete." })
      return
    }

    const confirmed = window.confirm(language === "zh" ? `删除当前页面显示的 ${jobs.length} 条任务记录？` : `Delete all ${jobs.length} job records shown on this page?`)
    if (!confirmed) {
      return
    }

    setMessage(null)

    await runWithPending("delete-jobs-page", async () => {
      try {
        const response = await deleteAdminJobsPage({ page: jobsPage, pageSize: jobsPageSize })
        const nextJobs = await loadJobs(jobsPage, jobsPageSize, jobsFilterUserId || undefined, jobsFilterUpstreamAccountId || undefined)
        if (nextJobs.pagination.pageCount > 0 && jobsPage > nextJobs.pagination.pageCount) {
          setJobsPage(nextJobs.pagination.pageCount)
        }
        await Promise.all([loadOverviewAndSettings(), loadUsers(), loadAccounts()])
        setMessage({ tone: "success", text: language === "zh" ? `已从当前页删除 ${response.deletedCount} 个任务。` : `Deleted ${response.deletedCount} jobs from the current page.` })
      } catch (error) {
        setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
      }
    })
  }

  const handleDeleteJob = async (jobId: string) => {
    const confirmed = window.confirm(language === "zh" ? `删除任务 ${jobId}？` : `Delete job ${jobId}?`)
    if (!confirmed) return

    setMessage(null)
    await runWithPending("delete-jobs-page", async () => {
      try {
        await deleteAdminJob(jobId)
        await loadJobs(jobsPage, jobsPageSize, jobsFilterUserId || undefined, jobsFilterUpstreamAccountId || undefined)
        setMessage({ tone: "success", text: language === "zh" ? `任务 ${jobId} 已删除。` : `Job ${jobId} deleted.` })
      } catch (error) {
        setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
      }
    })
  }

  const handleUpdateSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    if (settings && Number(settingsMultiplier) === settings.anlasMultiplier) {
      setMessage({ tone: "success", text: language === "zh" ? "平台设置已是最新。" : "Platform settings are already up to date." })
      return
    }

    await runWithPending("settings", async () => {
      try {
        const nextSettings = await updateAdminSettings({ anlasMultiplier: Number(settingsMultiplier) })
        setSettings(nextSettings)
        setSettingsMultiplier(String(nextSettings.anlasMultiplier))
        setMessage({ tone: "success", text: language === "zh" ? "平台设置已更新。" : "Platform settings updated." })
      } catch (error) {
        setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
      }
    })
  }

  const handleUpdateRuntimeConfig = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    const payload = buildRuntimeConfigPayload(runtimeConfigForm)
    if (runtimeConfig && runtimeConfigMatchesPayload(runtimeConfig, payload)) {
      setMessage({ tone: "success", text: language === "zh" ? "性能设置已是最新。" : "Performance settings are already up to date." })
      return
    }

    await runWithPending("runtime-config", async () => {
      try {
        const nextRuntimeConfig = await updateAdminRuntimeConfig(payload)
        setRuntimeConfig(nextRuntimeConfig)
        setRuntimeConfigForm(toRuntimeConfigForm(nextRuntimeConfig))
        await Promise.all([loadAccounts(), loadOverviewAndSettings()])
        setMessage({ tone: "success", text: language === "zh" ? "性能设置已更新。" : "Performance settings updated." })
      } catch (error) {
        setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
      }
    })
  }

  const handleUpdateManagedUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedManageUser) {
      return
    }

    setMessage(null)

    await runWithPending("update-user-balance", async () => {
      try {
        const response = await updateAdminUser(selectedManageUser.id, {
          balance: Number(manageBalance),
        })
        await loadUsers()
        setMessage({
          tone: "success",
          text: language === "zh" ? `已将 ${response.email} 的余额设置为 ${response.balance}。` : `Set balance for ${response.email} to ${response.balance}.`,
        })
      } catch (error) {
        setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
      }
    })
  }

  const handleToggleManagedUserStatus = async () => {
    if (!selectedManageUser) {
      return
    }

    setMessage(null)
    const nextStatus = selectedManageUser.status === "ACTIVE" ? "DISABLED" : "ACTIVE"

    await runWithPending("toggle-user-status", async () => {
      try {
        const response = await updateAdminUser(selectedManageUser.id, { status: nextStatus })
        await loadUsers()
        setMessage({
          tone: "success",
          text: language === "zh" ? `${response.email} 现在已${response.status === "ACTIVE" ? "启用" : "禁用"}。` : `${response.email} is now ${response.status.toLowerCase()}.`,
        })
      } catch (error) {
        setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
      }
    })
  }

  const handleDeleteManagedUser = async () => {
    if (!selectedManageUser) {
      return
    }

    if (!window.confirm(language === "zh" ? `删除 ${selectedManageUser.email}？这将移除该账户及其相关数据。` : `Delete ${selectedManageUser.email}? This will remove the account and its related data.`)) {
      return
    }

    setMessage(null)

    await runWithPending("delete-user", async () => {
      try {
        await deleteAdminUser(selectedManageUser.id)
        await Promise.all([loadUsers(), loadJobs(jobsPage, jobsPageSize, jobsFilterUserId || undefined, jobsFilterUpstreamAccountId || undefined), loadOverviewAndSettings()])
        setMessage({
          tone: "success",
          text: language === "zh" ? `已删除 ${selectedManageUser.email}。` : `Deleted ${selectedManageUser.email}.`,
        })
      } catch (error) {
        setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
      }
    })
  }

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    await runWithPending("create-account", async () => {
      try {
        const payload: CreateNovelAiAccountRequest = {
          label: createAccountForm.label.trim(),
          credentialKind: createAccountForm.credentialKind,
          credential: buildCredentialPayload({
            token: createAccountForm.token,
            cookie: createAccountForm.cookie,
            headersJson: createAccountForm.headersJson,
            notes: createAccountForm.notes,
          }),
          priority: Number(createAccountForm.priority),
          maxConcurrentJobs: 1,
        }

        await createAdminAccount(payload)
        await Promise.all([loadAccounts(), loadOverviewAndSettings()])
        setCreateAccountForm({
          label: "",
          credentialKind: createAccountForm.credentialKind,
          token: "",
          cookie: "",
          headersJson: "{}",
          notes: "",
          priority: "0",
        })
        setMessage({ tone: "success", text: language === "zh" ? "NovelAI 账户已创建。" : "NovelAI account created." })
      } catch (error) {
        setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
      }
    })
  }

  const handleRunUpstreamHealthChecks = async () => {
    const accountsToCheck = accounts.filter((account) => !account.leased)
    if (accountsToCheck.length === 0) {
      setMessage({ tone: "success", text: language === "zh" ? "没有可执行健康检查的上游账户。" : "There are no available upstream accounts to health check." })
      return
    }

    setMessage(null)

    await runWithPending("upstream-health-check", async () => {
      let successCount = 0
      let failureCount = 0
      let firstError: string | null = null

      for (const account of accountsToCheck) {
        try {
          await testAdminAccount(account.id, { mode: "health_check", acknowledgeNetwork: true })
          successCount += 1
        } catch (error) {
          failureCount += 1
          firstError ??= getAdminApiErrorMessage(error)
        }
      }

      await Promise.all([loadAccounts(), loadOverviewAndSettings()])

      if (failureCount > 0) {
        setMessage({
          tone: "error",
          text: language === "zh"
            ? `已检查 ${successCount}/${accountsToCheck.length} 个账户。${firstError ?? `${failureCount} 次检查失败。`}`
            : `Health checked ${successCount}/${accountsToCheck.length} accounts. ${firstError ?? `${failureCount} checks failed.`}`,
        })
        return
      }

      setMessage({ tone: "success", text: language === "zh" ? `已健康检查 ${successCount} 个上游账户。` : `Health checked ${successCount} upstream accounts.` })
    })
  }

  const handleCreatePolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    await runWithPending("create-policy", async () => {
      try {
        const payload: CreatePolicyRequest = {
          name: createPolicyForm.name.trim(),
          scope: createPolicyForm.scope,
          role: createPolicyForm.role || null,
          userId: createPolicyForm.userId.trim() || null,
          priority: Number(createPolicyForm.priority),
          enabled: createPolicyForm.enabled,
          rules: parseJsonText<PolicyRule[]>(createPolicyForm.rulesJson, "Policy rules"),
        }

        await createAdminPolicy(payload)
        await Promise.all([loadPolicies(), loadOverviewAndSettings()])
        setMessage({ tone: "success", text: language === "zh" ? "策略已创建。" : "Policy created." })
      } catch (error) {
        setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
      }
    })
  }

  const handlePreviewPolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    await runWithPending("preview-policy", async () => {
      try {
        const decision = await previewAdminPolicy({
          params: parseJsonText<Record<string, unknown>>(previewForm.paramsJson, "Preview params"),
          role: previewForm.role || undefined,
          userId: previewForm.userId.trim() || undefined,
        })
        setPreviewDecision(decision)
        setMessage({ tone: "success", text: decision.accepted ? (language === "zh" ? "策略预览接受了这些参数。" : "Policy preview accepted the params.") : (language === "zh" ? "策略预览拒绝了这些参数。" : "Policy preview rejected the params.") })
      } catch (error) {
        setMessage({ tone: "error", text: getAdminApiErrorMessage(error) })
      }
    })
  }

  if (authLoading) {
    return (
      <div className={adminShellClassName}>
        {message ? <FloatingFeedbackPanel message={message} onDismiss={() => setMessage(null)} /> : null}
        <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-12">
          <div className={cn(cardClassName, "w-full max-w-md p-6 text-center")}>{t("Checking your admin session…")}</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className={adminShellClassName}>
        {message ? <FloatingFeedbackPanel message={message} onDismiss={() => setMessage(null)} /> : null}
        <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-12">
          <div className={cn(cardClassName, "w-full max-w-md p-6")}>
            <div className="mb-6">
              <div className="text-[24px] leading-8">{t("NovelAI Router Admin")}</div>
              <div className={cn(subtleTextClassName, "mt-2")}>
                {language === "zh" ? "使用管理员账户登录以访问本地后端管理界面。" : "Sign in with an admin account to access the local backend management surface."}
              </div>
            </div>


            <form className="space-y-4" onSubmit={handleLogin}>
              <div className="space-y-2">
                <label className={labelClassName} htmlFor="admin-email">
                  {t("Email")}
                </label>
                <input
                  autoComplete="email"
                  className={fieldClassName}
                  id="admin-email"
                  onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="admin@example.com"
                  type="email"
                  value={loginForm.email}
                />
              </div>
              <div className="space-y-2">
                <label className={labelClassName} htmlFor="admin-password">
                  {t("Password")}
                </label>
                <input
                  autoComplete="current-password"
                  className={fieldClassName}
                  id="admin-password"
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder={t("Enter admin password")}
                  type="password"
                  value={loginForm.password}
                />
              </div>
              <button className={primaryButtonClassName} disabled={authSubmitting} type="submit">
                {authSubmitting ? t("Signing in…") : t("Sign in")}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className={adminShellClassName}>
        {message ? <FloatingFeedbackPanel message={message} onDismiss={() => setMessage(null)} /> : null}
        <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-12">
          <div className={cn(cardClassName, "w-full max-w-xl p-6")}>
            <div className="text-[24px] leading-8">{t("Admin role required")}</div>
            <div className={cn(subtleTextClassName, "mt-2")}>
              {language === "zh" ? "当前登录账户为" : "You are signed in as"} {user.email}{language === "zh" ? "，但该账户角色是" : ", but this account has the"} <span className="font-semibold text-white/85">{formatUserRole(user.role, language)}</span> {language === "zh" ? "。" : "role."}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className={secondaryButtonClassName} href="/">
                {t("Back to workspace")}
              </Link>
              <button className={primaryButtonClassName} disabled={isPending("logout")} onClick={handleLogout} type="button">
                {isPending("logout") ? t("Signing out…") : t("Sign out")}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen overflow-hidden bg-[rgb(13,15,31)] text-white">
      {message ? <FloatingFeedbackPanel message={message} onDismiss={() => setMessage(null)} /> : null}
      {selectedFailedJob ? <JobFailureReasonDialog job={selectedFailedJob} onClose={() => setSelectedFailedJob(null)} t={t} /> : null}
      {succeededJobDetail ? (
        <JobResultDialog
          job={succeededJobDetail}
          isLoading={isLoadingJobDetail}
          onClose={() => setSucceededJobDetail(null)}
          t={t}
        />
      ) : null}
      <div className="flex h-full min-w-0">
        <AdminSidebar activeSection={activeSection} onSelectSection={handleSelectSection} t={t} user={user} />
        <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto" ref={(node) => {
          mainContentRef.current = node
        }}>
          <div className="mx-auto w-full max-w-[1680px] px-5 py-6 lg:px-8">
            <div className="flex flex-col gap-4 border-b border-white/5 pb-6 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-[32px] leading-10">{t("NovelAI Router Admin")}</div>
                <div className={cn(subtleTextClassName, "mt-2 max-w-3xl")}>
                  {language === "zh" ? "嵌入式后端的同源管理控制台，使用现有认证和管理代理路由" : "Same-origin admin console for the embedded backend. It uses the existing auth and admin proxy routes under"} <span className="font-mono text-white/75">/api/auth</span> {language === "zh" ? "与" : "and"} <span className="font-mono text-white/75">/api/admin</span>{language === "zh" ? "。" : "."}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
                <button className={secondaryButtonClassName} disabled={isPending("refresh") || dataLoading} onClick={handleRefresh} type="button">
                  {isPending("refresh") || dataLoading ? t("Refreshing…") : t("Refresh")}
                </button>
                <button className={primaryButtonClassName} disabled={isPending("logout")} onClick={handleLogout} type="button">
                  {isPending("logout") ? t("Signing out…") : t("Sign out")}
                </button>
              </div>
            </div>


            {activeSection === "overview" ? (
              <section className="pt-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {readinessCards.map((card) => (
                    <div className={cn(cardClassName, "p-4")} key={card.label}>
                      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/55">{card.label}</div>
                      <div className="mt-3 text-[30px] leading-9">{card.value}</div>
                      <div className="mt-2 text-sm text-white/60">{card.secondary}</div>
                    </div>
                  ))}
                </div>

                {accountConfig ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <CompactInfo label={language === "zh" ? "代理" : "Proxy"} value={accountConfig.proxyConfigured ? (language === "zh" ? "已配置" : "Configured") : t("Missing")} />
                    <CompactInfo label={language === "zh" ? "健康检查" : "Health checks"} value={accountConfig.healthChecksEnabled ? t("Enabled") : (language === "zh" ? "已禁用" : "Disabled")} />
                    <CompactInfo label={language === "zh" ? "冒烟测试" : "Smoke tests"} value={accountConfig.smokeTestsEnabled ? t("Enabled") : (language === "zh" ? "已禁用" : "Disabled")} />
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                  <SectionCard title={t("Backend readiness")} subtitle={language === "zh" ? "来自 /api/admin/overview 的实时状态" : "Live status from /api/admin/overview"}>
                    {overview ? (
                      <>
                        <div className={cn("rounded-[3px] border px-3 py-2 text-sm", overview.readiness.readyForRealGeneration ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-100")}>
                          {overview.readiness.readyForRealGeneration ? (language === "zh" ? "已准备好进行真实生成。" : "Ready for real generation.") : (language === "zh" ? "尚未准备好进行真实生成。" : "Not ready for real generation.")}
                        </div>
                        {overview.readiness.blockers.length > 0 ? (
                          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/70">
                            {overview.readiness.blockers.map((blocker) => (
                              <li key={blocker}>{blocker}</li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    ) : (
                      <div className={subtleTextClassName}>{t("Loading readiness…")}</div>
                    )}
                  </SectionCard>

                  <SectionCard title={t("Platform settings")} subtitle={language === "zh" ? "更新计费倍率" : "Update billing multipliers"}>
                    <form className="space-y-4" onSubmit={handleUpdateSettings}>
                      <div className="space-y-2">
                        <label className={labelClassName} htmlFor="anlas-multiplier">
                          {t("Anlas multiplier")}
                        </label>
                        <input className={fieldClassName} id="anlas-multiplier" inputMode="decimal" onChange={(event) => setSettingsMultiplier(event.target.value)} value={settingsMultiplier} />
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button className={primaryButtonClassName} disabled={isPending("settings")} type="submit">
                          {isPending("settings") ? t("Saving…") : t("Save settings")}
                        </button>
                        {settings ? <div className={subtleTextClassName}>{language === "zh" ? "更新于" : "Updated"} {formatDateTime(settings.updatedAt, language)}</div> : null}
                      </div>
                    </form>
                  </SectionCard>
                </div>

                <div className="mt-4">
                  <SectionCard title={t("Frontend gallery")} subtitle={language === "zh" ? "刷新工作区落地页显示的快速开始图库顺序。" : "Refresh the quickstart gallery image order shown on the workspace landing state."}>
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1 text-sm text-white/65">
                        <div>{language === "zh" ? "当前种子：" : "Current seed: "}<span className="font-mono text-white/80">{overview?.galleryOrder?.seed ?? "default"}</span></div>
                        <div>{overview?.galleryOrder ? formatGalleryOrderUpdatedAt(overview.galleryOrder.updatedAt, language) : t("Updated —")}</div>
                      </div>
                      <button className={primaryButtonClassName} disabled={isPending("gallery-order")} onClick={() => void handleRefreshGalleryOrder()} type="button">
                        {isPending("gallery-order") ? t("Refreshing…") : t("Refresh gallery order")}
                      </button>
                    </div>
                  </SectionCard>
                </div>
              </section>
            ) : null}

            {activeSection === "jobs" ? (
              <section className="pt-6">
                <SectionCard title={t("Jobs")} subtitle={language === "zh" ? "分页查看生成任务、用户账户、上游账户、生成参数和 Anlas 使用量。" : "Paginated generation jobs with user account, upstream account, generation params, and Anlas usage."}>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        className="rounded-[3px] border border-[rgb(46,50,82)] bg-[rgb(19,21,44)] px-3 py-1.5 text-[13px] text-white/85 outline-none"
                        onChange={(e) => setJobsFilterUserId(e.target.value)}
                        value={jobsFilterUserId}
                      >
                        <option value="">{t("All users")}</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.email}</option>
                        ))}
                      </select>
                      <select
                        className="rounded-[3px] border border-[rgb(46,50,82)] bg-[rgb(19,21,44)] px-3 py-1.5 text-[13px] text-white/85 outline-none"
                        onChange={(e) => setJobsFilterUpstreamAccountId(e.target.value)}
                        value={jobsFilterUpstreamAccountId}
                      >
                        <option value="">{t("All upstream accounts")}</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.label}</option>
                        ))}
                      </select>
                      {(jobsFilterUserId || jobsFilterUpstreamAccountId) ? (
                        <button
                          className="rounded-[3px] px-2 py-1.5 text-[12px] text-white/45 transition-colors hover:text-white/75"
                          onClick={() => { setJobsFilterUserId(""); setJobsFilterUpstreamAccountId("") }}
                          type="button"
                        >
                          {t("Clear filters")}
                        </button>
                      ) : null}
                    </div>
                    <button className={secondaryButtonClassName} disabled={isPending("delete-jobs-page") || jobs.length === 0} onClick={() => void handleDeleteCurrentJobsPage()} type="button">
                      {isPending("delete-jobs-page") ? t("Deleting…") : t("Delete current page")}
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm text-white/75">
                      <thead className="text-[12px] uppercase tracking-[0.08em] text-white/45">
                        <tr>
                          <th className="px-0 py-2 pr-4 font-medium">{t("Job")}</th>
                          <th className="px-0 py-2 pr-4 font-medium">{t("User account")}</th>
                          <th className="w-[170px] px-0 py-2 pr-4 font-medium">{t("Upstream account")}</th>
                          <th className="px-0 py-2 pr-4 font-medium">{t("Status")}</th>
                          <th className="px-0 py-2 pr-4 font-medium">{t("Anlas / Platform units")}</th>
                          <th className="px-0 py-2 pr-4 font-medium">{t("Created")}</th>
                          <th className="px-0 py-2 font-medium">{t("Params")}</th>
                          <th className="w-12 px-0 py-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.length ? (
                          jobs.map((job) => (
                            <tr className="border-t border-white/5 align-top" key={job.id}>
                              <td
                                className="px-0 py-3 pr-4 font-mono text-[12px] text-white/80 cursor-pointer transition-colors hover:text-white"
                                title={language === "zh" ? "点击复制完整 ID" : "Click to copy full ID"}
                                onClick={() => { void navigator.clipboard.writeText(job.id) }}
                              >
                                {truncateMiddle(job.id)}
                              </td>
                              <td className="px-0 py-3 pr-4">
                                <div className="text-white/90">{job.user.email}</div>
                                <div className="mt-1 text-[12px] text-white/50">{t("Balance")} {job.user.balance} · {formatUserRole(job.user.role, language)}</div>
                              </td>
                              <td className="w-[170px] max-w-[170px] px-0 py-3 pr-4">
                                {job.upstreamAccount ? (
                                  <div className="min-w-0 max-w-[170px]">
                                    <div className="truncate text-white/90" title={job.upstreamAccount.label}>{job.upstreamAccount.label}</div>
                                    <div className="mt-1 truncate text-[12px] text-white/50" title={job.upstreamAccount.remoteAccountLabel ?? job.upstreamAccount.id}>
                                      {job.upstreamAccount.remoteAccountLabel ?? truncateMiddle(job.upstreamAccount.id)}
                                    </div>
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-0 py-3 pr-4">
                                {job.status === "FAILED" ? (
                                  <button
                                    className="rounded-[3px] text-left font-semibold text-rose-200 transition-colors hover:text-rose-100"
                                    onClick={() => setSelectedFailedJob({ id: job.id, errorCode: job.errorCode, errorMessage: job.errorMessage })}
                                    type="button"
                                  >
                                    {formatJobStatus(job.status, language)}
                                  </button>
                                ) : job.status === "SUCCEEDED" ? (
                                  job.outputCount > 0 ? (
                                    <button
                                      className="rounded-[3px] text-left font-semibold text-emerald-200 transition-colors hover:text-emerald-100"
                                      onClick={() => {
                                        setIsLoadingJobDetail(true)
                                        setSucceededJobDetail(null)
                                        void getAdminJobDetail(job.id).then((detail) => {
                                          setSucceededJobDetail(detail)
                                          setIsLoadingJobDetail(false)
                                        })
                                      }}
                                      type="button"
                                    >
                                      {formatJobStatus(job.status, language)}
                                    </button>
                                  ) : (
                                    <div className="font-semibold text-emerald-200/60">{formatJobStatus(job.status, language)}</div>
                                  )
                                ) : (
                                  <div className="text-white/85">{formatJobStatus(job.status, language)}</div>
                                )}
                              </td>
                              <td className="px-0 py-3 pr-4">
                                <div className="text-white/85">{formatAnlasUsage(job.actualNovelAiAnlas, job.estimatedNovelAiAnlas, language)}</div>
                                <div className="mt-1 text-[12px] text-white/50">{language === "zh" ? "平台点数：" : "Platform units: "}{job.billedPlatformUnits ?? "—"}</div>
                              </td>
                              <td className="px-0 py-3 pr-4">{formatDateTime(job.createdAt, language)}</td>
                              <td className="px-0 py-3">
                                <details className="group w-[320px] max-w-full rounded-[3px] border border-[rgb(46,50,82)] bg-[rgb(19,21,44)] px-3 py-2">
                                  <summary className="cursor-pointer list-none text-white/85 marker:hidden">{t("View params")}</summary>
                                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-white/65">{formatJobParams(job)}</pre>
                                </details>
                              </td>
                              <td className="px-0 py-3">
                                <button
                                  className="flex h-8 w-8 items-center justify-center rounded-[3px] text-white/40 transition-colors hover:bg-[rgb(34,37,63)] hover:text-rose-300"
                                  disabled={isPending("delete-jobs-page")}
                                  onClick={() => void handleDeleteJob(job.id)}
                                  title={t("Delete job")}
                                  type="button"
                                >
                                  <Trash2 className="h-[14px] w-[14px]" strokeWidth={2} />
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="px-0 py-3 text-white/50" colSpan={8}>
                              {t("No jobs yet.")}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-white/5 pt-4">
                    <div className={subtleTextClassName}>
                      {jobsResponse
                        ? language === "zh"
                          ? `显示 ${jobs.length ? `${(jobsResponse.pagination.page - 1) * jobsResponse.pagination.pageSize + 1}-${Math.min(jobsResponse.pagination.page * jobsResponse.pagination.pageSize, jobsResponse.pagination.total)}` : "0"} / ${jobsResponse.pagination.total} 个任务`
                          : `Showing ${jobs.length ? `${(jobsResponse.pagination.page - 1) * jobsResponse.pagination.pageSize + 1}-${Math.min(jobsResponse.pagination.page * jobsResponse.pagination.pageSize, jobsResponse.pagination.total)}` : "0"} of ${jobsResponse.pagination.total} jobs`
                        : t("Loading jobs…")}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-white/70">
                      <span>{t("Rows")}</span>
                      <select
                        className={cn(fieldClassName, "w-[92px] py-1.5")}
                        onChange={(event) => {
                          setJobsPage(1)
                          setJobsPageSize(Number(event.target.value) as (typeof adminPageSizeOptions)[number])
                        }}
                        value={jobsPageSize}
                      >
                        {adminPageSizeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <PaginationControls
                    currentPage={jobsResponse?.pagination.page ?? jobsPage}
                    onPageChange={setJobsPage}
                    pageCount={jobsResponse?.pagination.pageCount ?? 0}
                    t={t}
                  />
                </SectionCard>
              </section>
            ) : null}

            {activeSection === "account" ? (
              <section className="pt-6">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
                  <SectionCard title={t("User accounts")} subtitle={language === "zh" ? "发放平台点数前，检查用户余额和生成活动。" : "Inspect user balances and generation activity before granting platform units."}>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm text-white/75">
                        <thead className="text-[12px] uppercase tracking-[0.08em] text-white/45">
                          <tr>
                            <th className="px-0 py-2 pr-4 font-medium">{t("User")}</th>
                            <th className="px-0 py-2 pr-4 font-medium">{t("Role")}</th>
                            <th className="px-0 py-2 pr-4 font-medium">{t("Status")}</th>
                            <th className="px-0 py-2 pr-4 font-medium">{t("Balance")}</th>
                            <th className="px-0 py-2 pr-4 font-medium">{t("Jobs")}</th>
                            <th className="px-0 py-2 font-medium">{t("Created")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleUsers.length ? (
                            visibleUsers.map((entry) => (
                              <tr
                                className={cn("cursor-pointer border-t border-white/5 transition-colors hover:bg-white/[0.03]", selectedUserId === entry.id ? "bg-white/[0.05]" : undefined)}
                                key={entry.id}
                                onClick={() => {
                                  setSelectedUserId(entry.id)
                                  setManageBalance(String(entry.balance))
                                }}
                              >
                                <td className="px-0 py-3 pr-4">
                                  <div className="text-white/90">{entry.email}</div>
                                  <div className="mt-1 font-mono text-[12px] text-white/45">{truncateMiddle(entry.id)}</div>
                                </td>
                                <td className="px-0 py-3 pr-4">{formatUserRole(entry.role, language)}</td>
                                <td className="px-0 py-3 pr-4">{formatUserStatus(entry.status, language)}</td>
                                <td className="px-0 py-3 pr-4">{entry.balance}</td>
                                <td className="px-0 py-3 pr-4">{entry.generationCount}</td>
                                <td className="px-0 py-3">{formatDateTime(entry.createdAt, language)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className="px-0 py-3 text-white/50" colSpan={6}>
                                {t("No users yet.")}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-white/5 pt-4">
                      <div className={subtleTextClassName}>{language === "zh" ? "用户总数：" : "Total users: "}{users.length}</div>
                      <label className="flex items-center gap-2 text-sm text-white/70">
                        <span>{t("Rows")}</span>
                        <select
                          className={cn(fieldClassName, "w-[92px] py-1.5")}
                          onChange={(event) => {
                            setUserRows(Number(event.target.value) as (typeof adminPageSizeOptions)[number])
                          }}
                          value={userRows}
                        >
                          {adminPageSizeOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </SectionCard>

                  <div className="grid gap-4">
                    <SectionCard title={t("Manage Account")} subtitle={language === "zh" ? "设置余额、启用或禁用访问权限，并删除用户账户。" : "Set balance, enable or disable access, and delete a user account."}>
                      <form className="space-y-4" onSubmit={handleUpdateManagedUser}>
                        <div className="space-y-2">
                          <label className={labelClassName} htmlFor="manage-user-id">
                            {t("User account")}
                          </label>
                          <select
                            className={fieldClassName}
                            id="manage-user-id"
                            onChange={(event) => setSelectedUserId(event.target.value)}
                            value={selectedUserId}
                          >
                            {users.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.email}
                              </option>
                            ))}
                          </select>
                        </div>
                        {selectedManageUser ? (
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                            <CompactInfo label={t("Status")} value={formatUserStatus(selectedManageUser.status, language)} />
                            <CompactInfo label={t("Role")} value={formatUserRole(selectedManageUser.role, language)} />
                            <CompactInfo label={t("Current balance")} value={selectedManageUser.balance} />
                            <CompactInfo label={t("User ID")} value={<span className="font-mono text-[12px] text-white/75">{truncateMiddle(selectedManageUser.id)}</span>} />
                          </div>
                        ) : null}
                        <div className="space-y-2">
                          <label className={labelClassName} htmlFor="manage-user-balance">
                            {t("Balance")}
                          </label>
                          <input className={fieldClassName} id="manage-user-balance" inputMode="numeric" onChange={(event) => setManageBalance(event.target.value)} placeholder="100" value={manageBalance} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button className={primaryButtonClassName} disabled={isPending("update-user-balance") || !selectedManageUser} type="submit">
                            {isPending("update-user-balance") ? t("Saving…") : t("Set balance")}
                          </button>
                          <button className={secondaryButtonClassName} disabled={isPending("toggle-user-status") || !selectedManageUser} onClick={() => void handleToggleManagedUserStatus()} type="button">
                            {isPending("toggle-user-status") ? t("Updating…") : selectedManageUser?.status === "ACTIVE" ? t("Disable account") : t("Enable account")}
                          </button>
                        </div>
                        <button className={dangerButtonClassName} disabled={isPending("delete-user") || !selectedManageUser} onClick={() => void handleDeleteManagedUser()} type="button">
                          {isPending("delete-user") ? t("Deleting…") : t("Delete account")}
                        </button>
                      </form>
                    </SectionCard>

                  </div>
                </div>
              </section>
            ) : null}

            {activeSection === "upstream-accounts" ? (
              <section className="pt-6">
                <div className="grid gap-4 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
                  <SectionCard title={t("Create upstream account")} subtitle={language === "zh" ? "在嵌入式后端中保存加密的上游 NovelAI 凭据。" : "Stores encrypted upstream NovelAI credentials in the embedded backend."}>
                    <form className="space-y-4" onSubmit={handleCreateAccount}>
                      <div className="space-y-2">
                        <label className={labelClassName} htmlFor="account-label">
                          {t("Label")}
                        </label>
                        <input className={fieldClassName} id="account-label" onChange={(event) => setCreateAccountForm((current) => ({ ...current, label: event.target.value }))} placeholder={language === "zh" ? "主账户" : "Primary account"} value={createAccountForm.label} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                        <div className="space-y-2">
                          <label className={labelClassName} htmlFor="account-kind">
                            {t("Credential kind")}
                          </label>
                          <select className={fieldClassName} id="account-kind" onChange={(event) => setCreateAccountForm((current) => ({ ...current, credentialKind: event.target.value as NovelAiCredentialKind }))} value={createAccountForm.credentialKind}>
                            <option value="API_TOKEN">{formatNovelAiCredentialKind("API_TOKEN", language)}</option>
                            <option value="SESSION_COOKIE">{formatNovelAiCredentialKind("SESSION_COOKIE", language)}</option>
                            <option value="CUSTOM_JSON">{formatNovelAiCredentialKind("CUSTOM_JSON", language)}</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className={labelClassName} htmlFor="account-priority">
                            {t("Priority")}
                          </label>
                          <input className={fieldClassName} id="account-priority" inputMode="numeric" onChange={(event) => setCreateAccountForm((current) => ({ ...current, priority: event.target.value }))} value={createAccountForm.priority} />
                        </div>
                      </div>
                      {showCreateAccountTokenField ? (
                        <div className="space-y-2">
                          <label className={labelClassName} htmlFor="account-token">
                            {t("Token")}
                          </label>
                          <textarea className={cn(fieldClassName, "min-h-24")} id="account-token" onChange={(event) => setCreateAccountForm((current) => ({ ...current, token: event.target.value }))} placeholder={t("Optional API token")} value={createAccountForm.token} />
                        </div>
                      ) : null}
                      {showCreateAccountCookieField ? (
                        <div className="space-y-2">
                          <label className={labelClassName} htmlFor="account-cookie">
                            {t("Cookie")}
                          </label>
                          <textarea className={cn(fieldClassName, "min-h-24")} id="account-cookie" onChange={(event) => setCreateAccountForm((current) => ({ ...current, cookie: event.target.value }))} placeholder={t("Optional session cookie")} value={createAccountForm.cookie} />
                        </div>
                      ) : null}
                      {showCreateAccountHeadersField ? (
                        <div className="space-y-2">
                          <label className={labelClassName} htmlFor="account-headers-json">
                            {t("Headers JSON")}
                          </label>
                          <textarea className={cn(fieldClassName, "min-h-28 font-mono text-[12px]")} id="account-headers-json" onChange={(event) => setCreateAccountForm((current) => ({ ...current, headersJson: event.target.value }))} value={createAccountForm.headersJson} />
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        <label className={labelClassName} htmlFor="account-notes">
                          {t("Notes")}
                        </label>
                        <textarea className={cn(fieldClassName, "min-h-24")} id="account-notes" onChange={(event) => setCreateAccountForm((current) => ({ ...current, notes: event.target.value }))} value={createAccountForm.notes} />
                      </div>
                      <button className={primaryButtonClassName} disabled={isPending("create-account")} type="submit">
                        {isPending("create-account") ? t("Creating…") : t("Create upstream account")}
                      </button>
                    </form>
                  </SectionCard>

                  <SectionCard
                    actions={
                      <button className={secondaryButtonClassName} disabled={isPending("upstream-health-check") || accounts.length === 0} onClick={() => void handleRunUpstreamHealthChecks()} type="button">
                        {isPending("upstream-health-check") ? t("Checking…") : t("Health check")}
                      </button>
                    }
                    title={t("Upstream accounts")}
                    subtitle={language === "zh" ? "检查就绪状态并管理上游 NovelAI 凭据。" : "Inspect readiness and manage upstream NovelAI credentials."}
                  >
                    <div className="space-y-4">
                      {accounts.length ? (
                        accounts.map((account) => (
                          <AccountCard
                            account={account}
                            isPending={isPending}
                            key={`${account.id}-${account.updatedAt}`}
                            onActionError={(text) => setMessage({ tone: "error", text })}
                            onActionSuccess={(text) => setMessage({ tone: "success", text })}
                            onRefresh={async () => {
                              await Promise.all([loadAccounts(), loadOverviewAndSettings(), loadJobs(jobsPage, jobsPageSize, jobsFilterUserId || undefined, jobsFilterUpstreamAccountId || undefined)])
                            }}
                            language={language}
                            runWithPending={runWithPending}
                            t={t}
                          />
                        ))
                      ) : (
                        <div className={subtleTextClassName}>{t("No upstream accounts configured.")}</div>
                      )}
                    </div>
                  </SectionCard>
                </div>
              </section>
            ) : null}

            {activeSection === "other-settings" ? (
              <section className="pt-6">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                  <SectionCard title={t("Performance settings")} subtitle={language === "zh" ? "限制后端总生成并发，降低 CPU、内存和带宽压力。每个上游账户并发始终为 1。" : "Limit total backend generation concurrency to reduce CPU, memory, and bandwidth pressure. Per-upstream-account concurrency is always 1."}>
                    <form className="grid gap-4 md:grid-cols-2" onSubmit={handleUpdateRuntimeConfig}>
                      <div className="space-y-2 md:col-span-2">
                        <label className={labelClassName} htmlFor="runtime-generation-concurrency">{t("Total generation concurrency")}</label>
                        <input className={fieldClassName} id="runtime-generation-concurrency" inputMode="numeric" min={1} onChange={(event) => setRuntimeConfigForm((current) => ({ ...current, generationConcurrency: event.target.value }))} value={runtimeConfigForm.generationConcurrency} />
                        <div className={subtleTextClassName}>{language === "zh" ? "控制后端工作器在所有用户和上游账户之间同时运行的最大生成任务数。较低数值可降低性能开销和带宽占用；较高数值需要足够的启用上游账户，因为每个账户同一时间只能运行 1 个任务。" : "Controls the maximum number of generation jobs the backend worker runs at once across all users and upstream accounts. Lower values reduce performance overhead and bandwidth usage; higher values need enough active upstream accounts because each account can run only 1 job at a time."}</div>
                        <div className={subtleTextClassName}>{language === "zh" ? "Mbps 公式：（最终输出字节 + SSE 中间帧字节）× 8 ÷ 运行秒数 ÷ 1,000,000。" : "Mbps formula: (final output bytes + SSE intermediate-frame bytes) × 8 ÷ runtime seconds ÷ 1,000,000."}</div>
                        <div className={subtleTextClassName}>{formatBandwidthEstimate(bandwidthEstimate, runtimeConfigForm.generationConcurrency, language)}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                        <button className={primaryButtonClassName} disabled={isPending("runtime-config")} type="submit">
                          {isPending("runtime-config") ? t("Saving…") : t("Save performance settings")}
                        </button>
                        {runtimeConfig ? <div className={subtleTextClassName}>{language === "zh" ? "更新于" : "Updated"} {formatDateTime(runtimeConfig.updatedAt, language)}</div> : null}
                      </div>
                    </form>
                  </SectionCard>

                  <SectionCard title={t("Managed secrets")} subtitle={language === "zh" ? "凭据加密和会话密钥由后端自动管理。" : "Credential encryption and session secrets are auto-managed by the backend."}>
                    {runtimeConfig ? (
                      <div className="grid gap-3">
                        <CompactInfo label={t("Credential encryption")} value={runtimeConfig.credentialEncryption.keyPresent ? t("Ready") : t("Missing")} />
                        <CompactInfo label={t("Key source")} value={runtimeConfig.credentialEncryption.mode === "auto_file" ? t("Auto-managed file") : t("Environment override")} />
                      </div>
                    ) : (
                      <div className={subtleTextClassName}>{t("Loading runtime settings…")}</div>
                    )}
                  </SectionCard>
                </div>
              </section>
            ) : null}

            {activeSection === "policies" ? (
              <section className="pt-6">
                <div className="grid gap-4 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
                  <SectionCard title={t("Create policy")} subtitle={language === "zh" ? "策略规则的原始 JSON 编辑器" : "Raw JSON editor for policy rules"}>
                    <form className="space-y-4" onSubmit={handleCreatePolicy}>
                      <div className="space-y-2">
                        <label className={labelClassName} htmlFor="policy-name">
                          {t("Name")}
                        </label>
                        <input className={fieldClassName} id="policy-name" onChange={(event) => setCreatePolicyForm((current) => ({ ...current, name: event.target.value }))} value={createPolicyForm.name} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                        <div className="space-y-2">
                          <label className={labelClassName} htmlFor="policy-scope">
                            {t("Scope")}
                          </label>
                          <select className={fieldClassName} id="policy-scope" onChange={(event) => setCreatePolicyForm((current) => ({ ...current, scope: event.target.value as PolicyScope }))} value={createPolicyForm.scope}>
                            <option value="GLOBAL">{formatPolicyScope("GLOBAL", language)}</option>
                            <option value="ROLE">{formatPolicyScope("ROLE", language)}</option>
                            <option value="USER">{formatPolicyScope("USER", language)}</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className={labelClassName} htmlFor="policy-priority">
                            {t("Priority")}
                          </label>
                          <input className={fieldClassName} id="policy-priority" inputMode="numeric" onChange={(event) => setCreatePolicyForm((current) => ({ ...current, priority: event.target.value }))} value={createPolicyForm.priority} />
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                        <div className="space-y-2">
                          <label className={labelClassName} htmlFor="policy-role">
                            {t("Role override")}
                          </label>
                          <select className={fieldClassName} id="policy-role" onChange={(event) => setCreatePolicyForm((current) => ({ ...current, role: event.target.value as "" | UserRole }))} value={createPolicyForm.role}>
                            <option value="">{t("None")}</option>
                            <option value="USER">{formatUserRole("USER", language)}</option>
                            <option value="ADMIN">{formatUserRole("ADMIN", language)}</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className={labelClassName} htmlFor="policy-user-id">
                            {t("User ID override")}
                          </label>
                          <input className={fieldClassName} id="policy-user-id" onChange={(event) => setCreatePolicyForm((current) => ({ ...current, userId: event.target.value }))} value={createPolicyForm.userId} />
                        </div>
                      </div>
                      <label className="flex items-center gap-3 text-sm text-white/75">
                        <input checked={createPolicyForm.enabled} className="h-4 w-4 accent-[rgb(245,243,194)]" onChange={(event) => setCreatePolicyForm((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" />
                        {t("Enabled")}
                      </label>
                      <div className="space-y-2">
                        <label className={labelClassName} htmlFor="policy-rules-json">
                          {t("Rules JSON")}
                        </label>
                        <textarea className={cn(fieldClassName, "min-h-56 font-mono text-[12px]")} id="policy-rules-json" onChange={(event) => setCreatePolicyForm((current) => ({ ...current, rulesJson: event.target.value }))} value={createPolicyForm.rulesJson} />
                      </div>
                      <button className={primaryButtonClassName} disabled={isPending("create-policy")} type="submit">
                        {isPending("create-policy") ? t("Creating…") : t("Create policy")}
                      </button>
                    </form>
                  </SectionCard>

                  <SectionCard title={t("Policies")} subtitle={t("Edit and disable existing policies")}>
                    <div className="space-y-4">
                      {policies.length ? (
                        policies.map((policy) => (
                          <PolicyCard
                            isPending={isPending}
                            key={`${policy.id}-${policy.version}`}
                            onActionError={(text) => setMessage({ tone: "error", text })}
                            onActionSuccess={(text) => setMessage({ tone: "success", text })}
                            onRefresh={async () => {
                              await Promise.all([loadPolicies(), loadOverviewAndSettings()])
                            }}
                            language={language}
                            policy={policy}
                            runWithPending={runWithPending}
                            t={t}
                          />
                        ))
                      ) : (
                        <div className={subtleTextClassName}>{t("No policies found.")}</div>
                      )}
                    </div>
                  </SectionCard>
                </div>
              </section>
            ) : null}

            {activeSection === "policy-preview" ? (
              <section className="py-6">
                <SectionCard title={t("Policy preview")} subtitle={language === "zh" ? "用当前策略栈测试传入的生成参数" : "Test incoming generation params against the current policy stack"}>
                  <form className="grid gap-4 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]" onSubmit={handlePreviewPolicy}>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className={labelClassName} htmlFor="preview-role">
                          {t("Role override")}
                        </label>
                        <select className={fieldClassName} id="preview-role" onChange={(event) => setPreviewForm((current) => ({ ...current, role: event.target.value as "" | UserRole }))} value={previewForm.role}>
                          <option value="">{t("Current admin role")}</option>
                          <option value="USER">{formatUserRole("USER", language)}</option>
                          <option value="ADMIN">{formatUserRole("ADMIN", language)}</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className={labelClassName} htmlFor="preview-user-id">
                          {t("User ID override")}
                        </label>
                        <input className={fieldClassName} id="preview-user-id" onChange={(event) => setPreviewForm((current) => ({ ...current, userId: event.target.value }))} value={previewForm.userId} />
                      </div>
                      <button className={primaryButtonClassName} disabled={isPending("preview-policy")} type="submit">
                        {isPending("preview-policy") ? t("Previewing…") : t("Run preview")}
                      </button>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        <label className={labelClassName} htmlFor="preview-params-json">
                          {t("Params JSON")}
                        </label>
                        <textarea className={cn(fieldClassName, "min-h-72 font-mono text-[12px]")} id="preview-params-json" onChange={(event) => setPreviewForm((current) => ({ ...current, paramsJson: event.target.value }))} value={previewForm.paramsJson} />
                      </div>
                      <div className="space-y-2">
                        <label className={labelClassName}>{t("Decision")}</label>
                        <pre className="min-h-72 overflow-auto rounded-[3px] border border-[rgb(46,50,82)] bg-[rgb(19,21,44)] p-3 text-[12px] leading-5 text-white/80">
                          {previewDecision ? JSON.stringify(previewDecision, null, 2) : language === "zh" ? "运行预览以查看标准化参数、命中的规则和违规项。" : "Run a preview to inspect the normalized params, applied rules, and violations."}
                        </pre>
                      </div>
                    </div>
                  </form>
                </SectionCard>
              </section>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  )
}

function AdminSidebar({
  activeSection,
  onSelectSection,
  t,
  user,
}: {
  activeSection: AdminSection
  onSelectSection: (section: AdminSection) => void
  t: AdminTranslator
  user: AdminUser
}) {
  return (
    <aside className="scrollbar-thin flex h-full w-[278px] shrink-0 flex-col overflow-y-auto border-r border-white/5 bg-[rgb(19,21,44)] text-white">
      <div className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-4 py-[10px]">
          <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full bg-[rgb(151,115,255)] text-white shadow-[0_0_0_2px_rgba(255,255,255,0.03)]">
            <UserRound className="h-[28px] w-[28px]" strokeWidth={2.05} />
          </div>
          <div className="min-w-0">
            <div className="truncate font-heading text-[22px] leading-[33px] font-bold text-[rgb(245,243,194)]">{t("Admin Console")}</div>
            <div className="mt-[-3px] truncate text-[16px] leading-6 font-semibold text-white/45">{user.email}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 pb-5 pt-4">
        <AdminSidebarSection label={t("Dashboard")}>
          <AdminSidebarLink active={activeSection === "overview"} icon={<ChartNoAxesColumn className="h-[16px] w-[16px]" strokeWidth={2.1} />} label={t("Overview")} onClick={() => onSelectSection("overview")} />
          <AdminSidebarLink active={activeSection === "jobs"} icon={<Wallet className="h-[16px] w-[16px]" strokeWidth={2.1} />} label={t("Jobs")} onClick={() => onSelectSection("jobs")} />
        </AdminSidebarSection>

        <AdminSidebarSection label={t("Accounts")}>
          <AdminSidebarLink active={activeSection === "account"} icon={<UserRound className="h-[16px] w-[16px]" strokeWidth={2.1} />} label={t("Manage Account")} onClick={() => onSelectSection("account")} />
          <AdminSidebarLink active={activeSection === "upstream-accounts"} icon={<KeyRound className="h-[16px] w-[16px]" strokeWidth={2.1} />} label={t("Upstream Account")} onClick={() => onSelectSection("upstream-accounts")} />
          <AdminSidebarLink active={activeSection === "other-settings"} icon={<Settings2 className="h-[16px] w-[16px]" strokeWidth={2.1} />} label={t("Performance")} onClick={() => onSelectSection("other-settings")} />
        </AdminSidebarSection>

        <AdminSidebarSection label={t("Governance")}>
          <AdminSidebarLink active={activeSection === "policies"} icon={<ShieldCheck className="h-[16px] w-[16px]" strokeWidth={2.1} />} label={t("Policies")} onClick={() => onSelectSection("policies")} />
          <AdminSidebarLink active={activeSection === "policy-preview"} icon={<ScanSearch className="h-[16px] w-[16px]" strokeWidth={2.1} />} label={t("Policy Preview")} onClick={() => onSelectSection("policy-preview")} />
        </AdminSidebarSection>
      </div>

      <div className="border-t border-white/5 px-5 pb-4 pt-3">
        <div className="space-y-[10px]">
          <Link className={sidebarItemClassName} href="/">
            <span className="flex min-w-0 items-center gap-[15px]">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-white/80">
                <UserRound className="h-[16px] w-[16px]" strokeWidth={2.1} />
              </span>
              <span className="min-w-0 truncate">{t("Workspace")}</span>
            </span>
            <span aria-hidden="true" className="w-0 shrink-0" />
          </Link>
        </div>
      </div>
    </aside>
  )
}

function AdminSidebarSection({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section className="mt-[14px]">
      <div className="py-[10px] text-[14px] leading-[1.5] font-semibold text-white/70">{label}</div>
      <div className="space-y-[10px]">{children}</div>
    </section>
  )
}

function AdminSidebarLink({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button className={cn(sidebarItemClassName, active ? "bg-[rgb(34,37,63)] text-[rgb(245,243,194)]" : undefined)} onClick={onClick} type="button">
      <span className="flex min-w-0 items-center gap-[15px]">
        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center", active ? "text-[rgb(245,243,194)]" : "text-white/80")}>{icon}</span>
        <span className="min-w-0 truncate">{label}</span>
      </span>
      <span aria-hidden="true" className="w-0 shrink-0" />
    </button>
  )
}

function AccountCard({
  account,
  isPending,
  language,
  onRefresh,
  onActionSuccess,
  onActionError,
  runWithPending,
  t,
}: {
  account: NovelAiAccountSummary
  isPending: (key: string) => boolean
  language: NovelAIUiLanguage
  onRefresh: () => Promise<void>
  onActionSuccess: (text: string) => void
  onActionError: (text: string) => void
  runWithPending: (key: string, task: () => Promise<void>) => Promise<void>
  t: AdminTranslator
}) {
  const [label, setLabel] = useState(account.label)
  const [priority, setPriority] = useState(String(account.priority))
  const [cooldownUntil, setCooldownUntil] = useState(toDatetimeLocalValue(account.cooldownUntil))
  const [isExpanded, setIsExpanded] = useState(false)
  const accountFieldPrefix = `account-${account.id}`

  const accountBusy = (suffix: string) => isPending(`account:${account.id}:${suffix}`)

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextLabel = label.trim()
    const nextPriority = Number(priority)
    const nextCooldownUntil = cooldownUntil ? new Date(cooldownUntil).toISOString() : null

    if (nextLabel === account.label && nextPriority === account.priority && nextCooldownUntil === account.cooldownUntil) {
      onActionSuccess(language === "zh" ? `${account.label} 已是最新。` : `${account.label} is already up to date.`)
      return
    }

    await runWithPending(`account:${account.id}:save`, async () => {
      try {
        await updateAdminAccount(account.id, {
          label: nextLabel,
          priority: nextPriority,
          cooldownUntil: nextCooldownUntil,
        })
        await onRefresh()
        onActionSuccess(language === "zh" ? `已保存 ${account.label}。` : `Saved ${account.label}.`)
      } catch (error) {
        onActionError(getAdminApiErrorMessage(error))
      }
    })
  }

  const handleToggle = async (enabled: boolean) => {
    await runWithPending(`account:${account.id}:${enabled ? "enable" : "disable"}`, async () => {
      try {
        await setAdminAccountEnabled(account.id, enabled)
        await onRefresh()
        onActionSuccess(language === "zh" ? `${account.label} 已${enabled ? "启用" : "禁用"}。` : `${enabled ? "Enabled" : "Disabled"} ${account.label}.`)
      } catch (error) {
        onActionError(getAdminApiErrorMessage(error))
      }
    })
  }

  const handleDelete = async () => {
    if (!window.confirm(language === "zh" ? `删除上游账户 ${account.label}？` : `Delete upstream account ${account.label}?`)) {
      return
    }

    await runWithPending(`account:${account.id}:delete`, async () => {
      try {
        await deleteAdminAccount(account.id)
        await onRefresh()
        onActionSuccess(language === "zh" ? `已删除 ${account.label}。` : `Deleted ${account.label}.`)
      } catch (error) {
        onActionError(getAdminApiErrorMessage(error))
      }
    })
  }

  return (
    <div className={cn(cardClassName, "p-4")}>
      <div className="flex flex-col gap-4 border-b border-white/5 pb-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={getUpstreamStatusDotClassName(account)} />
            <div className="text-[18px] leading-7">{account.label}</div>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[12px] uppercase tracking-[0.08em] text-white/45">
            <span>{formatUpstreamAccountStatus(account.status, language)}</span>
            <span>{formatNovelAiCredentialKind(account.credentialKind, language)}</span>
            <span>{language === "zh" ? "优先级" : "priority"} {account.priority}</span>
            <span>{language === "zh" ? "密钥" : "key"} v{account.credentialKeyVersion}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button aria-expanded={isExpanded} className={secondaryButtonClassName} onClick={() => setIsExpanded((current) => !current)} type="button">
            <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded ? "rotate-0" : "-rotate-90")} strokeWidth={2.1} />
            <span>{isExpanded ? t("Collapse") : t("Expand")}</span>
          </button>
          <button
            className={secondaryButtonClassName}
            disabled={accountBusy("enable") || accountBusy("disable")}
            onClick={() => void handleToggle(account.status !== "ACTIVE")}
            type="button"
          >
            {accountBusy("enable") || accountBusy("disable")
              ? account.status === "ACTIVE"
                ? t("Disabling…")
                : t("Enabling…")
              : account.status === "ACTIVE"
                ? t("Disable")
                : t("Enable")}
          </button>
          <button className={dangerButtonClassName} disabled={accountBusy("delete") || account.leased} onClick={() => void handleDelete()} type="button">
            {accountBusy("delete") ? t("Deleting…") : t("Delete")}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <form className="space-y-4" onSubmit={handleSave}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={labelClassName} htmlFor={`${accountFieldPrefix}-label`}>
                    {t("Label")}
                  </label>
                  <input className={fieldClassName} id={`${accountFieldPrefix}-label`} onChange={(event) => setLabel(event.target.value)} value={label} />
                </div>
                <div className="space-y-2">
                  <label className={labelClassName} htmlFor={`${accountFieldPrefix}-priority`}>
                    {t("Priority")}
                  </label>
                  <input className={fieldClassName} id={`${accountFieldPrefix}-priority`} inputMode="numeric" onChange={(event) => setPriority(event.target.value)} value={priority} />
                </div>
              </div>
              <div className="space-y-2">
                <label className={labelClassName} htmlFor={`${accountFieldPrefix}-cooldown-until`}>
                  {t("Cooldown until")}
                </label>
                <input className={fieldClassName} id={`${accountFieldPrefix}-cooldown-until`} onChange={(event) => setCooldownUntil(event.target.value)} type="datetime-local" value={cooldownUntil} />
              </div>
              <button className={primaryButtonClassName} disabled={accountBusy("save")} type="submit">
                {accountBusy("save") ? t("Saving…") : t("Save account")}
              </button>
            </form>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CompactInfo label={t("Health")} value={formatUpstreamHealth(account, language)} />
              <CompactInfo label={t("Tier")} value={account.remoteTier ?? "—"} />
              <CompactInfo label={t("Active")} value={formatUpstreamActive(account, language)} />
              <CompactInfo label={t("Remaining Anlas")} value={formatUpstreamAnlas(account)} />
              <CompactInfo label={t("Leased")} value={formatAdminBoolean(account.leased, language)} />
              <CompactInfo label={t("Lease job")} value={account.leasedGenerationJobId ? truncateMiddle(account.leasedGenerationJobId) : "—"} />
              <CompactInfo label={t("Last checked")} value={formatDateTime(account.lastCheckedAt, language)} />
              <CompactInfo label={t("Last used")} value={formatDateTime(account.lastUsedAt, language)} />
              <CompactInfo label={t("Last success")} value={formatDateTime(account.lastSuccessAt, language)} />
              <CompactInfo label={t("Last failure")} value={formatDateTime(account.lastFailureAt, language)} />
            </div>
          </div>
        </>
      ) : null}

      {account.leased ? (
        <div className="mt-4 rounded-[3px] border border-[rgba(245,243,194,0.18)] bg-[rgba(245,243,194,0.07)] px-3 py-2 text-sm text-[rgb(245,243,194)]">
          {language === "zh" ? "该上游账户当前已租用给某个生成任务，暂时无法删除。" : "This upstream account is currently leased to a generation job and cannot be deleted yet."}
        </div>
      ) : null}

      {(account.lastErrorCode || account.lastErrorMessage) ? (
        <div className="mt-4 rounded-[3px] border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
          {account.lastErrorCode ? `${account.lastErrorCode}: ` : null}
          {account.lastErrorMessage ?? t("Unknown account error")}
        </div>
      ) : null}
    </div>
  )
}

function PolicyCard({
  policy,
  isPending,
  language,
  onRefresh,
  onActionSuccess,
  onActionError,
  runWithPending,
  t,
}: {
  policy: PolicyRecord
  isPending: (key: string) => boolean
  language: NovelAIUiLanguage
  onRefresh: () => Promise<void>
  onActionSuccess: (text: string) => void
  onActionError: (text: string) => void
  runWithPending: (key: string, task: () => Promise<void>) => Promise<void>
  t: AdminTranslator
}) {
  const [name, setName] = useState(policy.name)
  const [scope, setScope] = useState<PolicyScope>(policy.scope)
  const [role, setRole] = useState<"" | UserRole>(policy.role ?? "")
  const [userId, setUserId] = useState(policy.userId ?? "")
  const [priority, setPriority] = useState(String(policy.priority))
  const [enabled, setEnabled] = useState(policy.enabled)
  const [rulesJson, setRulesJson] = useState(JSON.stringify(policy.rules, null, 2))
  const policyFieldPrefix = `policy-${policy.id}`

  const policyBusy = (suffix: string) => isPending(`policy:${policy.id}:${suffix}`)

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextName = name.trim()
    const nextUserId = userId.trim() || null
    const nextPriority = Number(priority)
    const nextRole = role || null
    const nextRules = parseJsonText<PolicyRule[]>(rulesJson, "Policy rules")

    if (
      nextName === policy.name &&
      scope === policy.scope &&
      nextRole === policy.role &&
      nextUserId === policy.userId &&
      nextPriority === policy.priority &&
      enabled === policy.enabled &&
      JSON.stringify(nextRules) === JSON.stringify(policy.rules)
    ) {
      onActionSuccess(language === "zh" ? `${policy.name} 已是最新。` : `${policy.name} is already up to date.`)
      return
    }

    await runWithPending(`policy:${policy.id}:save`, async () => {
      try {
        const payload: UpdatePolicyRequest = {
          name: nextName,
          scope,
          role: nextRole,
          userId: nextUserId,
          priority: nextPriority,
          enabled,
          rules: nextRules,
        }
        await updateAdminPolicy(policy.id, payload)
        await onRefresh()
        onActionSuccess(language === "zh" ? `已保存 ${policy.name}。` : `Saved ${policy.name}.`)
      } catch (error) {
        onActionError(getAdminApiErrorMessage(error))
      }
    })
  }

  const handleDisable = async () => {
    await runWithPending(`policy:${policy.id}:disable`, async () => {
      try {
        await disableAdminPolicy(policy.id)
        await onRefresh()
        onActionSuccess(language === "zh" ? `已禁用 ${policy.name}。` : `Disabled ${policy.name}.`)
      } catch (error) {
        onActionError(getAdminApiErrorMessage(error))
      }
    })
  }

  return (
    <div className={cn(cardClassName, "p-4")}>
      <div className="mb-4 flex flex-col gap-3 border-b border-white/5 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[18px] leading-7">{policy.name}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-[12px] uppercase tracking-[0.08em] text-white/45">
            <span>{formatPolicyScope(policy.scope, language)}</span>
            <span>v{policy.version}</span>
            <span>{policy.enabled ? (language === "zh" ? "已启用" : "enabled") : (language === "zh" ? "已禁用" : "disabled")}</span>
          </div>
        </div>
        <button className={secondaryButtonClassName} disabled={policyBusy("disable") || !policy.enabled} onClick={() => void handleDisable()} type="button">
          {policyBusy("disable") ? t("Disabling…") : t("Disable")}
        </button>
      </div>

      <form className="space-y-4" onSubmit={handleSave}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className={labelClassName} htmlFor={`${policyFieldPrefix}-name`}>
              {t("Name")}
            </label>
            <input className={fieldClassName} id={`${policyFieldPrefix}-name`} onChange={(event) => setName(event.target.value)} value={name} />
          </div>
          <div className="space-y-2">
            <label className={labelClassName} htmlFor={`${policyFieldPrefix}-priority`}>
              {t("Priority")}
            </label>
            <input className={fieldClassName} id={`${policyFieldPrefix}-priority`} inputMode="numeric" onChange={(event) => setPriority(event.target.value)} value={priority} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className={labelClassName} htmlFor={`${policyFieldPrefix}-scope`}>
              {t("Scope")}
            </label>
            <select className={fieldClassName} id={`${policyFieldPrefix}-scope`} onChange={(event) => setScope(event.target.value as PolicyScope)} value={scope}>
              <option value="GLOBAL">{formatPolicyScope("GLOBAL", language)}</option>
              <option value="ROLE">{formatPolicyScope("ROLE", language)}</option>
              <option value="USER">{formatPolicyScope("USER", language)}</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className={labelClassName} htmlFor={`${policyFieldPrefix}-role`}>
              {t("Role")}
            </label>
            <select className={fieldClassName} id={`${policyFieldPrefix}-role`} onChange={(event) => setRole(event.target.value as "" | UserRole)} value={role}>
              <option value="">{t("None")}</option>
              <option value="USER">{formatUserRole("USER", language)}</option>
              <option value="ADMIN">{formatUserRole("ADMIN", language)}</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className={labelClassName} htmlFor={`${policyFieldPrefix}-user-id`}>
              {t("User ID")}
            </label>
            <input className={fieldClassName} id={`${policyFieldPrefix}-user-id`} onChange={(event) => setUserId(event.target.value)} value={userId} />
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm text-white/75">
          <input checked={enabled} className="h-4 w-4 accent-[rgb(245,243,194)]" onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
          {t("Enabled")}
        </label>
        <div className="space-y-2">
          <label className={labelClassName} htmlFor={`${policyFieldPrefix}-rules-json`}>
            {t("Rules JSON")}
          </label>
          <textarea className={cn(fieldClassName, "min-h-56 font-mono text-[12px]")} id={`${policyFieldPrefix}-rules-json`} onChange={(event) => setRulesJson(event.target.value)} value={rulesJson} />
        </div>
        <button className={primaryButtonClassName} disabled={policyBusy("save")} type="submit">
          {policyBusy("save") ? t("Saving…") : t("Save policy")}
        </button>
      </form>
    </div>
  )
}

function PaginationControls({
  currentPage,
  onPageChange,
  pageCount,
  t,
}: {
  currentPage: number
  onPageChange: (page: number) => void
  pageCount: number
  t: AdminTranslator
}) {
  if (pageCount <= 1) {
    return null
  }

  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <button className={secondaryButtonClassName} disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} type="button">
        {t("Previous")}
      </button>
      <div className="text-sm text-white/65">
        {t("Page")} {currentPage} / {pageCount}
      </div>
      <button className={secondaryButtonClassName} disabled={currentPage >= pageCount} onClick={() => onPageChange(currentPage + 1)} type="button">
        {t("Next")}
      </button>
    </div>
  )
}

function SectionCard({
  actions,
  children,
  subtitle,
  title,
}: {
  actions?: React.ReactNode
  children: React.ReactNode
  subtitle: string
  title: string
}) {
  return (
    <section className={cn(cardClassName, "p-5")}>
      <div className="mb-4 border-b border-white/5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[20px] leading-8">{title}</div>
            <div className={cn(subtleTextClassName, "mt-1")}>{subtitle}</div>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function CompactInfo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[3px] border border-[rgb(46,50,82)] bg-[rgb(19,21,44)] px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">{label}</div>
      <div className="mt-1 text-sm text-white/80">{value}</div>
    </div>
  )
}

function JobFailureReasonDialog({
  job,
  onClose,
  t,
}: {
  job: { id: string; errorCode: string | null; errorMessage: string | null }
  onClose: () => void
  t: AdminTranslator
}) {
  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-[2px]" role="presentation">
      <button aria-label="close dialog" className="absolute inset-0" onClick={onClose} type="button" />
      <div className={cn(cardClassName, "relative z-[261] w-full max-w-[640px] p-5")} role="dialog" aria-modal="true" aria-labelledby="job-failure-dialog-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[24px] leading-8 text-white" id="job-failure-dialog-title">{t("FAILED job reason")}</div>
            <div className="mt-1 font-mono text-[12px] text-white/50">{job.id}</div>
          </div>
          <button className={secondaryButtonClassName} onClick={onClose} type="button">
            {t("Close")}
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <div className="rounded-[3px] border border-[rgb(46,50,82)] bg-[rgb(19,21,44)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">{t("Error code")}</div>
            <div className="mt-2 font-mono text-sm text-rose-200">{job.errorCode ?? "—"}</div>
          </div>
          <div className="rounded-[3px] border border-[rgb(46,50,82)] bg-[rgb(19,21,44)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">{t("Error message")}</div>
            <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-rose-100/90">{job.errorMessage ?? "—"}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function JobResultDialog({
  job,
  isLoading,
  onClose,
  t,
}: {
  job: AdminJobDetailResponse
  isLoading: boolean
  onClose: () => void
  t: AdminTranslator
}) {
  const columnCount = job.outputs.length === 1 ? 1 : 2

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-[2px]" role="presentation">
      <button aria-label="close dialog" className="absolute inset-0" onClick={onClose} type="button" />
      <div className={cn(cardClassName, "relative z-[261] w-full max-w-[960px] p-5")} role="dialog" aria-modal="true" aria-labelledby="job-result-dialog-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[24px] leading-8 text-white" id="job-result-dialog-title">{t("SUCCEEDED job results")}</div>
            <div className="mt-1 font-mono text-[12px] text-white/50">{job.id}</div>
          </div>
          <button className={secondaryButtonClassName} onClick={onClose} type="button">
            {t("Close")}
          </button>
        </div>

        {isLoading ? (
          <div className="mt-6 flex items-center justify-center py-16 text-white/50">{t("Loading results…")}</div>
        ) : job.outputs.length === 0 ? (
          <div className="mt-6 flex items-center justify-center py-16 text-white/50">{t("No output images")}</div>
        ) : (
          <div
            className="mt-5 grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
          >
            {job.outputs.map((output) => (
              <div
                key={output.index}
                className="overflow-hidden rounded-[3px] border border-[rgb(46,50,82)] bg-[rgb(19,21,44)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Admin result URLs need same-origin browser credentials. */}
                <img
                  alt={output.asset.originalFilename ?? `Output ${output.index + 1}`}
                  className="block max-h-[65vh] w-full object-contain"
                  src={`/api/admin/jobs/${encodeURIComponent(job.id)}/results/${output.index}`}
                />
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-[12px] text-white/60">#{output.index + 1}</span>
                  <span className="text-[12px] text-white/40">{output.asset.mimeType}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function toRuntimeConfigForm(config: BackendRuntimeConfig) {
  return {
    generationConcurrency: String(config.generationConcurrency),
    resultConsumerTimeoutMs: String(config.resultConsumerTimeoutMs),
    assetUploadMaxBytes: String(config.assetUploadMaxBytes),
    novelAiCredentialKeyVersion: String(config.novelAiCredentialKeyVersion),
    novelAiAccountLeaseTtlMs: String(config.novelAiAccountLeaseTtlMs),
    novelAiAccountLeaseHeartbeatMs: String(config.novelAiAccountLeaseHeartbeatMs),
    novelAiAccountAcquireTimeoutMs: String(config.novelAiAccountAcquireTimeoutMs),
    novelAiAccountCooldownMs: String(config.novelAiAccountCooldownMs),
    novelAiHttpTimeoutMs: String(config.novelAiHttpTimeoutMs),
    novelAiTestTimeoutMs: String(config.novelAiTestTimeoutMs),
    novelAiProxyUrl: config.novelAiProxyUrl ?? "",
    novelAiAdminHealthChecksEnabled: config.novelAiAdminHealthChecksEnabled,
    novelAiSmokeTestsEnabled: config.novelAiSmokeTestsEnabled,
  }
}

function buildRuntimeConfigPayload(input: ReturnType<typeof toRuntimeConfigForm>) {
  return {
    generationConcurrency: Number(input.generationConcurrency),
  }
}

function runtimeConfigMatchesPayload(config: BackendRuntimeConfig, payload: ReturnType<typeof buildRuntimeConfigPayload>) {
  return config.generationConcurrency === payload.generationConcurrency
}

interface BandwidthEstimate {
  averageMbps: number
  intermediateFrameCount: number
  p95Mbps: number
  sampleCount: number
}

function calculateBandwidthEstimate(jobs: AdminJobListResponse["jobs"]): BandwidthEstimate {
  const samples = jobs.flatMap((job) => {
    if (job.status !== "SUCCEEDED" || !job.startedAt || !job.completedAt) {
      return []
    }

    const startedAt = Date.parse(job.startedAt)
    const completedAt = Date.parse(job.completedAt)
    const durationSeconds = (completedAt - startedAt) / 1000
    const measuredBytes = job.outputBytes + job.intermediateOutputSseBytes
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || measuredBytes <= 0) {
      return []
    }

    return [{
      intermediateFrameCount: job.intermediateOutputCount,
      mbps: (measuredBytes * 8) / durationSeconds / 1_000_000,
    }]
  })

  if (samples.length === 0) {
    return { averageMbps: 0, intermediateFrameCount: 0, p95Mbps: 0, sampleCount: 0 }
  }

  const sortedMbps = samples.map((sample) => sample.mbps).sort((left, right) => left - right)
  const p95Index = Math.max(0, Math.ceil(sortedMbps.length * 0.95) - 1)
  return {
    averageMbps: sortedMbps.reduce((total, value) => total + value, 0) / sortedMbps.length,
    intermediateFrameCount: samples.reduce((total, sample) => total + sample.intermediateFrameCount, 0),
    p95Mbps: sortedMbps[p95Index] ?? 0,
    sampleCount: samples.length,
  }
}

function formatBandwidthEstimate(estimate: BandwidthEstimate, concurrencyInput: string, language: NovelAIUiLanguage) {
  if (estimate.sampleCount === 0) {
    return language === "zh"
      ? "当前任务页还没有具备足够字节数和运行时长的已完成任务，暂无法计算 Mbps。"
      : "No completed jobs on the current jobs page have enough measured bytes and runtime to calculate Mbps yet."
  }

  const concurrency = Math.max(1, Number(concurrencyInput))
  const peakP95Mbps = Number.isFinite(concurrency) ? estimate.p95Mbps * concurrency : estimate.p95Mbps
  const sseSuffix = estimate.intermediateFrameCount > 0
    ? language === "zh"
      ? ` 包含 ${estimate.intermediateFrameCount} 个已记录的 SSE 中间帧。`
      : ` Includes ${estimate.intermediateFrameCount} recorded SSE intermediate frame${estimate.intermediateFrameCount === 1 ? "" : "s"}.`
    : language === "zh"
      ? " 新记录的任务会计入 SSE 中间字节；旧任务可能显示 0 个中间帧。"
      : " SSE intermediate bytes are included for newly recorded jobs; older jobs may show 0 intermediate frames."
  return language === "zh"
    ? `基于当前任务页 ${estimate.sampleCount} 个已完成任务测量：平均每任务 ${formatMbps(estimate.averageMbps)}，p95 每任务 ${formatMbps(estimate.p95Mbps)}，p95 × 并发 ${concurrency} = ${formatMbps(peakP95Mbps)}。${sseSuffix}`
    : `Measured from ${estimate.sampleCount} completed job${estimate.sampleCount === 1 ? "" : "s"} on the current jobs page: avg ${formatMbps(estimate.averageMbps)} per task, p95 ${formatMbps(estimate.p95Mbps)} per task, p95 × concurrency ${concurrency} = ${formatMbps(peakP95Mbps)}.${sseSuffix}`
}

function formatMbps(value: number) {
  if (value > 0 && value < 0.01) {
    return "<0.01 Mbps"
  }

  return `${value < 10 ? value.toFixed(2) : value.toFixed(1)} Mbps`
}

function buildCredentialPayload(input: { token: string; cookie: string; headersJson: string; notes: string }): NovelAiCredentialPayload {
  const payload: NovelAiCredentialPayload = {}

  if (input.token.trim()) {
    payload.token = input.token.trim()
  }

  if (input.cookie.trim()) {
    payload.cookie = input.cookie.trim()
  }

  const headers = parseJsonText<Record<string, string>>(input.headersJson, "Headers JSON")
  if (Object.keys(headers).length > 0) {
    payload.headers = headers
  }

  if (input.notes.trim()) {
    payload.notes = input.notes.trim()
  }

  return payload
}

function parseJsonText<T>(value: string, label: string) {
  try {
    return JSON.parse(value) as T
  } catch {
    throw new Error(`${label} must be valid JSON.`)
  }
}

function formatNullableBoolean(value: boolean | null, language: NovelAIUiLanguage) {
  if (value === null) {
    return "—"
  }

  return formatAdminBoolean(value, language)
}

function getUpstreamStatusDotClassName(account: NovelAiAccountSummary) {
  const isHealthy = account.status === "ACTIVE" && !account.lastErrorCode && !account.lastErrorMessage && account.remoteActive !== false

  return cn(
    "inline-block h-[10px] w-[10px] rounded-full border",
    isHealthy
      ? "border-emerald-300/50 bg-emerald-400"
      : "border-rose-300/50 bg-rose-400"
  )
}

function formatUpstreamHealth(account: NovelAiAccountSummary, language: NovelAIUiLanguage) {
  if (account.lastErrorCode || account.lastErrorMessage) {
    return language === "zh" ? "错误" : "Error"
  }

  if (account.status === "DISABLED" || account.remoteActive === false) {
    return language === "zh" ? "不可用" : "Unavailable"
  }

  if (account.remoteActive === true) {
    return language === "zh" ? "健康" : "Healthy"
  }

  if (account.status === "ACTIVE" && account.lastSuccessAt) {
    return language === "zh" ? "健康" : "Healthy"
  }

  return account.lastCheckedAt ? (language === "zh" ? "已检查" : "Checked") : (language === "zh" ? "未知" : "Unknown")
}

function formatUpstreamActive(account: NovelAiAccountSummary, language: NovelAIUiLanguage) {
  if (account.remoteActive !== null) {
    return formatNullableBoolean(account.remoteActive, language)
  }

  if (account.status === "DISABLED") {
    return formatAdminBoolean(false, language)
  }

  if (account.status === "ACTIVE" && !account.lastErrorCode && !account.lastErrorMessage) {
    return formatAdminBoolean(true, language)
  }

  return "—"
}

function formatUpstreamAnlas(account: NovelAiAccountSummary) {
  return account.remoteAnlasBalance ?? account.remoteFixedTrainingStepsLeft ?? account.remotePurchasedTrainingSteps ?? "—"
}

function formatAnlasUsage(actual: number | null, estimated: number | null, language: NovelAIUiLanguage) {
  if (actual === null && estimated === null) {
    return "—"
  }

  if (actual !== null && estimated !== null) {
    return actual === estimated ? String(actual) : language === "zh" ? `${actual}（估算 ${estimated}）` : `${actual} (est. ${estimated})`
  }

  if (actual !== null) {
    return String(actual)
  }

  return estimated === null ? "—" : language === "zh" ? `估算 ${estimated}` : `Est. ${estimated}`
}

function formatJobParams(job: AdminJobListResponse["jobs"][number]) {
  const payload = job.normalizedParamsJson ?? job.submittedParamsJson

  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

function formatDateTime(value: string | null, language: NovelAIUiLanguage = "en") {
  if (!value) {
    return "—"
  }

  return new Date(value).toLocaleString(language === "zh" ? "zh-CN" : undefined)
}

function formatGalleryOrderUpdatedAt(value: string | null, language: NovelAIUiLanguage) {
  if (value === "1970-01-01T00:00:00.000Z") {
    return language === "zh" ? "尚未刷新" : "Not refreshed yet"
  }

  return language === "zh" ? `更新于 ${formatDateTime(value, language)}` : `Updated ${formatDateTime(value, language)}`
}

function toDatetimeLocalValue(value: string | null) {
  if (!value) {
    return ""
  }

  const date = new Date(value)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function truncateMiddle(value: string, visibleLength = 8) {
  if (value.length <= visibleLength * 2) {
    return value
  }

  return `${value.slice(0, visibleLength)}…${value.slice(-visibleLength)}`
}

const primaryButtonClassName = "inline-flex items-center justify-center rounded-[3px] bg-[rgb(245,243,194)] px-4 py-2 text-sm font-semibold text-[rgb(19,21,44)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
const secondaryButtonClassName = "inline-flex items-center justify-center rounded-[3px] border border-[rgb(46,50,82)] bg-[rgb(19,21,44)] px-4 py-2 text-sm text-white/85 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
const dangerButtonClassName = "inline-flex items-center justify-center rounded-[3px] border border-[rgba(182,77,91,0.55)] bg-[rgba(97,28,39,0.35)] px-4 py-2 text-sm text-[rgb(255,205,215)] transition-colors hover:bg-[rgba(115,34,47,0.5)] disabled:cursor-not-allowed disabled:opacity-50"
const sidebarItemClassName = "flex min-h-11 w-full shrink-0 items-center justify-between gap-[5px] rounded-[5px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-5 py-0 text-left text-[16px] font-semibold leading-6 text-white outline-[1px] outline-transparent transition-[background-color] duration-75 ease-in-out hover:bg-[rgb(29,31,56)]"

const defaultPolicyRules: PolicyRule[] = [
  { id: "default-model", field: "model", action: "default", value: "nai-diffusion-4-5-curated" },
  { id: "limit-steps", field: "steps", action: "clamp", min: 1, max: 40 },
]

const defaultPreviewParams = {
  model: "nai-diffusion-4-5-curated",
  width: 1024,
  height: 1024,
  steps: 28,
  scale: 5,
  sampler: "k_euler_ancestral",
}
