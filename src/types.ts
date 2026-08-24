export interface UsageWindow {
  usedPercent: number
  resetsAt: number | null
}

export interface ScopedModelWindow {
  modelLabel: string
  usedPercent: number
  resetsAt: number | null
}

export interface ExtraUsageSnapshot {
  enabled: boolean
  usedPercent: number | null
}

export interface AccountSnapshot {
  planType: string | null
  rateLimitTier: string | null
}

export interface ClaudeUsageData {
  source: 'claude-oauth-usage'
  fetchedAt: number
  account: AccountSnapshot
  session: UsageWindow | null
  weekly: UsageWindow | null
  weeklyScoped: ScopedModelWindow[]
  extraUsage: ExtraUsageSnapshot | null
}

export interface UsagePolicy {
  refreshIntervalMs: number
  hoverRefreshMinAgeMs: number
}

export type ClaudeUsageResponse =
  | { ok: true; data: ClaudeUsageData; policy: UsagePolicy }
  | { ok: false; error: { code: string; message: string }; stale: ClaudeUsageData | null; policy: UsagePolicy }
