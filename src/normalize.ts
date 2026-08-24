import type {
  AccountSnapshot,
  ClaudeUsageData,
  ExtraUsageSnapshot,
  ScopedModelWindow,
  UsageWindow,
} from './types.js'

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function percent(value: unknown): number | null {
  const raw = finite(value)
  return raw === null ? null : Math.max(0, Math.min(100, raw))
}

/** Accepts ISO strings (the documented shape) plus epoch numbers defensively; returns epoch ms. */
function resetsAtMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 1e11 ? value : value * 1000
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

interface ParsedWindows {
  session: UsageWindow | null
  weekly: UsageWindow | null
  scoped: ScopedModelWindow[]
}

function windowsFromLimits(value: unknown): ParsedWindows {
  const parsed: ParsedWindows = { session: null, weekly: null, scoped: [] }
  const limits = Array.isArray(value) ? value : []
  for (const entry of limits) {
    const limit = object(entry)
    if (limit === null) continue
    const kind = text(limit.kind)
    const usedPercent = percent(limit.percent)
    if (kind === null || usedPercent === null) continue
    const resetsAt = resetsAtMs(limit.resets_at)
    if (kind === 'session') {
      parsed.session ??= { usedPercent, resetsAt }
    } else if (kind === 'weekly_all') {
      parsed.weekly ??= { usedPercent, resetsAt }
    } else if (kind === 'weekly_scoped') {
      if (limit.is_active === false) continue
      const scope = object(limit.scope)
      const model = scope === null ? null : object(scope.model)
      const modelLabel = model === null ? null : text(model.display_name)
      const surface = scope === null ? null : text(scope.surface)
      parsed.scoped.push({
        modelLabel: modelLabel ?? surface ?? 'Model',
        usedPercent,
        resetsAt,
      })
    }
  }
  return parsed
}

function legacyWindow(value: unknown): UsageWindow | null {
  const row = object(value)
  if (row === null) return null
  const usedPercent = percent(row.utilization)
  if (usedPercent === null) return null
  return { usedPercent, resetsAt: resetsAtMs(row.resets_at) }
}

function extraUsage(value: unknown): ExtraUsageSnapshot | null {
  const row = object(value)
  if (row === null || typeof row.is_enabled !== 'boolean') return null
  return { enabled: row.is_enabled, usedPercent: percent(row.utilization) }
}

/**
 * Strict allowlist projection of the usage payload. Percentages are clamped,
 * reset timestamps normalized to epoch milliseconds, and every unrecognized
 * field (identifiers, tokens, emails, future additions) is dropped.
 */
export function normalizeUsage(payload: unknown, account: AccountSnapshot, fetchedAt = Date.now()): ClaudeUsageData {
  const row = object(payload) ?? {}
  const parsed = windowsFromLimits(row.limits)
  const session = parsed.session ?? legacyWindow(row.five_hour)
  const weekly = parsed.weekly ?? legacyWindow(row.seven_day)

  return {
    source: 'claude-oauth-usage',
    fetchedAt,
    account: {
      planType: text(account.planType),
      rateLimitTier: text(account.rateLimitTier),
    },
    session,
    weekly,
    weeklyScoped: parsed.scoped,
    extraUsage: extraUsage(row.extra_usage),
  }
}
