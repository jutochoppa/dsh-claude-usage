export interface ClaudeUsageSettings {
  refreshIntervalMs: number
  hoverRefreshMinAgeMs: number
  requestTimeoutMs: number
  credentialsFile: string
}

export type SettingsField = keyof ClaudeUsageSettings

export interface SettingsDraft {
  refreshIntervalMs: string
  hoverRefreshMinAgeMs: string
  requestTimeoutMs: string
  credentialsFile: string
}

export interface SettingsWrite {
  field: SettingsField
  value: ClaudeUsageSettings[SettingsField]
}

export interface ClaudeUsageSettingsSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  value: ClaudeUsageSettings | undefined
  revision: number | undefined
}

export interface ClaudeUsageSettingsScope {
  getSnapshot(): ClaudeUsageSettingsSnapshot
  set(field: string, value: unknown): Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validInteger(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

export function decodeClaudeUsageSettings(value: unknown): ClaudeUsageSettings | undefined {
  if (!isRecord(value)) return undefined
  const { refreshIntervalMs, hoverRefreshMinAgeMs, requestTimeoutMs, credentialsFile } = value
  if (!validInteger(refreshIntervalMs, 60_000)) return undefined
  if (!validInteger(hoverRefreshMinAgeMs, 5_000)) return undefined
  if (!validInteger(requestTimeoutMs, 1_000)) return undefined
  // An empty credentialsFile selects the default per-OS location.
  if (typeof credentialsFile !== 'string') return undefined
  return { refreshIntervalMs, hoverRefreshMinAgeMs, requestTimeoutMs, credentialsFile }
}

export function settingsToDraft(settings: ClaudeUsageSettings): SettingsDraft {
  return {
    refreshIntervalMs: String(settings.refreshIntervalMs),
    hoverRefreshMinAgeMs: String(settings.hoverRefreshMinAgeMs),
    requestTimeoutMs: String(settings.requestTimeoutMs),
    credentialsFile: settings.credentialsFile,
  }
}

function parseInteger(value: string, minimum: number, label: string): number {
  if (!/^\d+$/u.test(value.trim())) throw new Error(`${label} must be a whole number`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be at least ${minimum}`)
  }
  return parsed
}

export function parseSettingsDraft(draft: SettingsDraft): ClaudeUsageSettings {
  return {
    refreshIntervalMs: parseInteger(draft.refreshIntervalMs, 60_000, 'Background refresh interval'),
    hoverRefreshMinAgeMs: parseInteger(draft.hoverRefreshMinAgeMs, 5_000, 'Hover refresh minimum age'),
    requestTimeoutMs: parseInteger(draft.requestTimeoutMs, 1_000, 'Request timeout'),
    credentialsFile: draft.credentialsFile,
  }
}

export function settingsEqual(left: ClaudeUsageSettings, right: ClaudeUsageSettings): boolean {
  return left.refreshIntervalMs === right.refreshIntervalMs
    && left.hoverRefreshMinAgeMs === right.hoverRefreshMinAgeMs
    && left.requestTimeoutMs === right.requestTimeoutMs
    && left.credentialsFile === right.credentialsFile
}

export function buildSettingsWritePlan(
  current: ClaudeUsageSettings,
  target: ClaudeUsageSettings,
): SettingsWrite[] {
  const writes: SettingsWrite[] = []
  for (const field of ['refreshIntervalMs', 'hoverRefreshMinAgeMs', 'requestTimeoutMs', 'credentialsFile'] as const) {
    if (current[field] !== target[field]) writes.push({ field, value: target[field] })
  }
  return writes
}

export async function saveClaudeUsageSettings(
  scope: ClaudeUsageSettingsScope,
  target: ClaudeUsageSettings,
  expectedRevision: number,
): Promise<void> {
  const initial = scope.getSnapshot()
  if (initial.status !== 'ready' || initial.value === undefined || initial.revision === undefined) {
    throw new Error('Claude usage settings are not ready')
  }
  if (initial.revision !== expectedRevision) {
    throw new Error('Claude usage settings changed while editing; discard and try again')
  }

  let expected = initial.value
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const snapshot = attempt === 0 ? initial : scope.getSnapshot()
    if (snapshot.status !== 'ready' || snapshot.value === undefined) {
      throw new Error('Claude usage settings became unavailable while saving')
    }
    if (!settingsEqual(snapshot.value, expected)) {
      throw new Error('Claude usage settings changed while saving; discard and try again')
    }
    const write = buildSettingsWritePlan(snapshot.value, target)[0]
    if (write === undefined) return
    await scope.set(write.field, write.value)
    expected = { ...snapshot.value, [write.field]: write.value }
  }

  const final = scope.getSnapshot()
  if (final.status === 'ready' && final.value !== undefined && settingsEqual(final.value, target)) return
  throw new Error('Claude usage settings save exceeded its bounded write plan')
}
