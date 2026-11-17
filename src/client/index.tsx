import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClaudeUsageData, UsageWindow } from '../types.js'
import {
  parseSettingsDraft,
  saveClaudeUsageSettings,
  settingsEqual,
  settingsToDraft,
  type ClaudeUsageSettings,
  type SettingsDraft,
  type SettingsField,
} from './settings.js'
import { UsageStore, type UsageState } from './store.js'
import { STYLE_ID, styles } from './styles.js'

export const inject = ['slots', 'configForms']

/** Host profile entry id (cordis.patch.yml); DSH 0.2 config forms are keyed by it. */
export const SETTINGS_NAMESPACE = 'claude-usage'

const store = new UsageStore()
// Claude logomark (simple-icons, CC0).
const CLAUDE_PATH = 'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z'

/** One limit row of the sidebar card. */
export interface CardLimit {
  key: string
  /** Full label for the wide sidebar. */
  label: string
  /** Compact label for the collapsed rail. */
  shortLabel: string
  window: UsageWindow
  /** Weekly resets include the date; 5-hour resets show the time only. */
  includeDate: boolean
}

/**
 * Rows in display order: 5-hour, weekly, then model-scoped weekly limits.
 * A plan that reports a weekly window but no 5-hour window has no 5-hour row.
 */
export function cardLimits(data: ClaudeUsageData | null): CardLimit[] {
  if (data === null) return []
  const rows: CardLimit[] = []
  if (data.session !== null) {
    rows.push({ key: 'session', label: '5-hour limit', shortLabel: '5h', window: data.session, includeDate: false })
  }
  if (data.weekly !== null) {
    rows.push({ key: 'weekly', label: 'Weekly limit', shortLabel: 'Week', window: data.weekly, includeDate: true })
  }
  data.weeklyScoped.forEach((entry, index) => {
    rows.push({
      key: `scoped-${String(index)}`,
      label: `Weekly limit · ${entry.modelLabel}`,
      shortLabel: entry.modelLabel,
      window: { usedPercent: entry.usedPercent, resetsAt: entry.resetsAt },
      includeDate: true,
    })
  })
  return rows
}

/** Whole-number share of the window still available, clamped to 0–100. */
export function remainingPercent(usedPercent: number): number {
  const used = Number.isFinite(usedPercent) ? Math.min(100, Math.max(0, usedPercent)) : 100
  return Math.round(100 - used)
}

function formatTime(timestamp: number | null, includeDate: boolean): string | null {
  if (timestamp === null) return null
  const date = new Date(timestamp)
  if (Number.isNaN(date.valueOf())) return null
  const options: Intl.DateTimeFormatOptions = includeDate
    ? { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { hour: 'numeric', minute: '2-digit' }
  const locale = typeof document === 'undefined' ? undefined : document.documentElement.lang || undefined
  try {
    return new Intl.DateTimeFormat(locale, options).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date)
  }
}

function titleCase(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function ClaudeLogo() {
  return <svg className="dcl-logo" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d={CLAUDE_PATH} />
  </svg>
}

function LimitRow({ limit, wide }: { limit: CardLimit; wide: boolean }) {
  const remaining = remainingPercent(limit.window.usedPercent)
  const reset = formatTime(limit.window.resetsAt, limit.includeDate)
  const resetText = reset === null ? 'Reset time unavailable' : `${reset} Reset`
  return <section className="dcl-limit" aria-label={limit.label}>
    <div className="dcl-limit-title" title={limit.label}>{wide ? limit.label : limit.shortLabel}</div>
    <div
      className="dcl-track"
      role="progressbar"
      aria-label={limit.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={remaining}
    >
      <div className="dcl-fill" style={{ width: `${String(remaining)}%` }} />
    </div>
    <div className="dcl-details">
      <span className="dcl-used">{wide ? `Remaining ${String(remaining)}%` : `${String(remaining)}% left`}</span>
      <span className="dcl-reset" title={resetText}>{wide ? resetText : (reset ?? '—')}</span>
    </div>
  </section>
}

/** When the shown numbers were read: time only for today, date and time otherwise. */
function updatedLabel(fetchedAt: number, now = Date.now()): string {
  const sameDay = new Date(fetchedAt).toDateString() === new Date(now).toDateString()
  return formatTime(fetchedAt, !sameDay) ?? 'an earlier check'
}

/**
 * Card notice. A failed refresh over older numbers says how old they are and
 * why the refresh failed, so stale numbers are never mistaken for live ones.
 */
export function statusMessage(state: UsageState, now = Date.now()): string | null {
  if (state.error !== null) {
    if (state.data === null) return state.error
    return `Not updated since ${updatedLabel(state.data.fetchedAt, now)}. ${state.error}`
  }
  if (state.data === null) return 'Loading usage…'
  if (state.data.session === null && state.data.weekly === null && state.data.weeklyScoped.length === 0) {
    return 'No usage limits reported for this plan.'
  }
  return null
}

/** Pure view of the sidebar card, styled after the Codex usage card. */
export function UsageCardView({ state, wide, onMouseEnter, onMouseLeave }: {
  state: UsageState
  wide: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const limits = cardLimits(state.data)
  const message = statusMessage(state)
  const plan = titleCase(state.data?.account.planType)
  const tier = titleCase(state.data?.account.rateLimitTier)
  const subtitle = [plan === null ? null : `${plan} plan`, tier].filter(Boolean).join(' · ')
  // The card must stay the slot's direct child: the footer CSS keys on that.
  return <div
    className={`dcl-card${wide ? ' dcl-wide' : ''}`}
    role="group"
    aria-label="Claude usage"
    title={subtitle || undefined}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
  >
    <header className="dcl-header">
      <ClaudeLogo />
      <span className="dcl-title">Claude usage</span>
    </header>
    {message !== null ? <p className="dcl-notice" role="status" aria-live="polite">{message}</p> : null}
    {limits.length > 0 ? <div className="dcl-limits">
      {limits.map(limit => <LimitRow key={limit.key} limit={limit} wide={wide} />)}
    </div> : null}
  </div>
}

/** Store-bound card; hovering requests a coalesced, debounced refresh. */
export function ClaudeUsageCard({ wide }: { wide: boolean }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearHover = () => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
  }
  useEffect(() => clearHover, [])
  return <UsageCardView
    state={state}
    wide={wide}
    onMouseEnter={() => {
      clearHover()
      hoverTimer.current = setTimeout(() => { void store.refresh(true) }, 250)
    }}
    onMouseLeave={clearHover}
  />
}

interface SettingsCardProps {
  scope: ConfigForm<ClaudeUsageSettings>
}

interface SettingsDraftState {
  value: SettingsDraft
  revision: number
}

interface SettingsFieldSpec {
  key: SettingsField
  label: string
  hint: string
  minimum?: number
}

const SETTINGS_FIELDS: SettingsFieldSpec[] = [
  {
    key: 'refreshIntervalMs',
    label: 'Background refresh interval',
    hint: 'Milliseconds between normal usage polls. Minimum 60000.',
    minimum: 60_000,
  },
  {
    key: 'hoverRefreshMinAgeMs',
    label: 'Hover refresh minimum age',
    hint: 'Milliseconds before another hover refresh may run. Minimum 5000.',
    minimum: 5_000,
  },
  {
    key: 'requestTimeoutMs',
    label: 'Request timeout',
    hint: 'Milliseconds allowed for each Anthropic usage request. Minimum 1000.',
    minimum: 1_000,
  },
  {
    key: 'credentialsFile',
    label: 'Credentials file',
    hint: 'Optional path to the Claude Code credentials file. Empty uses the default location.',
  },
]

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export function ClaudeUsageSettingsCard({ scope }: SettingsCardProps): JSX.Element | null {
  const subscribe = useCallback((listener: () => void) => scope.subscribe(listener), [scope])
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [draft, setDraft] = useState<SettingsDraftState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (snapshot.status === 'unavailable') return null
  const current = snapshot.value
  const visible = draft?.value ?? (current === undefined ? undefined : settingsToDraft(current))
  let parsed: ClaudeUsageSettings | undefined
  let validationError: string | null = null
  if (visible !== undefined) {
    try {
      parsed = parseSettingsDraft(visible)
    } catch (cause) {
      validationError = errorMessage(cause)
    }
  }
  const dirty = draft !== null
  const changed = parsed !== undefined && current !== undefined && !settingsEqual(parsed, current)
  const disabled = !snapshot.writable || saving || current === undefined || snapshot.revision === undefined

  const updateField = (key: SettingsField, value: string): void => {
    if (disabled || current === undefined || snapshot.revision === undefined) return
    const revision = snapshot.revision
    setError(null)
    setDraft(previous => {
      const next = { ...(previous?.value ?? settingsToDraft(current)), [key]: value }
      try {
        if (settingsEqual(parseSettingsDraft(next), current)) return null
      } catch {
        // Invalid drafts stay staged so the card can explain what must be fixed.
      }
      return { value: next, revision: previous?.revision ?? revision }
    })
  }

  const discard = (): void => {
    setDraft(null)
    setError(null)
  }

  const save = async (): Promise<void> => {
    if (draft === null || parsed === undefined || !changed || saving) return
    setSaving(true)
    setError(null)
    try {
      await saveClaudeUsageSettings(scope, parsed, draft.revision)
      setDraft(null)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  return <section className="dcl-settings-card" aria-labelledby="dcl-settings-title">
    <div className="dcl-settings-header">
      <span className="dcl-settings-heading">
        <span className="dcl-settings-title" id="dcl-settings-title">Claude usage</span>
        <span className="dcl-settings-description">Configure provider refresh and credential lookup limits.</span>
      </span>
      {dirty ? <span className="dcl-settings-pending">Unsaved</span> : null}
    </div>
    <div className="dcl-settings-body">
      <p className="dcl-settings-notice">Saved settings apply immediately; no restart is needed. Sign-in comes from Claude Code (claude login).</p>
      {visible === undefined
        ? <p className="dcl-settings-status">Loading Claude usage settings…</p>
        : <>
          {SETTINGS_FIELDS.map(spec => <label className="dcl-settings-field" key={spec.key}>
            <span className="dcl-settings-copy">
              <span className="dcl-settings-label">{spec.label}</span>
              <span className="dcl-settings-hint">{spec.hint}</span>
            </span>
            <input
              className="dcl-settings-input"
              type={spec.minimum === undefined ? 'text' : 'number'}
              min={spec.minimum}
              step={spec.minimum === undefined ? undefined : 1}
              value={visible[spec.key]}
              disabled={disabled}
              aria-label={spec.label}
              onChange={event => { updateField(spec.key, event.currentTarget.value) }}
            />
          </label>)}
          <div className="dcl-settings-footer">
            <p className="dcl-settings-error" role={error !== null || validationError !== null ? 'alert' : undefined}>
              {error ?? validationError ?? ''}
            </p>
            <button type="button" className="dcl-settings-button" disabled={!dirty || saving} onClick={discard}>Discard</button>
            <button
              type="button"
              className="dcl-settings-button dcl-settings-save"
              disabled={!dirty || !changed || validationError !== null || saving || !snapshot.writable}
              onClick={() => { void save() }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>}
    </div>
  </section>
}
type FooterActionProps = PropsRuntime<'sidebar.footer.action'>

/** Full-width sidebar card in the footer action list (Codex usage layout). */
export function FooterUsageCard({ wide }: FooterActionProps) {
  return <ClaudeUsageCard wide={wide} />
}

/** Sits right after the Codex usage card (order -1000) when both are installed. */
export const FOOTER_ORDER = -999

export function apply(ctx: Context): void {
  const settingsForm = ctx.configForms.get<ClaudeUsageSettings>(SETTINGS_NAMESPACE)

  ctx.effect(() => {
    if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return () => {}
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-claude-usage'
    tag.dataset.pluginCss = STYLE_ID
    tag.textContent = styles
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'claude-usage: styles')

  ctx.effect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const poll = async () => {
      await store.refresh(false)
      if (stopped) return
      timer = setTimeout(() => { void poll() }, store.getSnapshot().policy.refreshIntervalMs)
    }
    void poll()
    return () => {
      stopped = true
      if (timer !== null) clearTimeout(timer)
    }
  }, 'claude-usage: polling')

  const SettingsCard = (): JSX.Element | null => <ClaudeUsageSettingsCard scope={settingsForm} />
  // DSH 0.2: one page per plugin inside Settings → Plugins.
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'claude-usage',
    order: 100,
    label: 'Claude usage',
  }, SettingsCard))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'claude-usage',
    order: FOOTER_ORDER,
    label: 'Claude usage',
  }, FooterUsageCard))
}
