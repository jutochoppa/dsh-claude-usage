import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClaudeUsageData, ScopedModelWindow, UsageWindow } from '../types.js'
import {
  decodeClaudeUsageSettings,
  parseSettingsDraft,
  saveClaudeUsageSettings,
  settingsEqual,
  settingsToDraft,
  type ClaudeUsageSettings,
  type SettingsDraft,
  type SettingsField,
} from './settings.js'
import { UsageStore } from './store.js'
import { STYLE_ID, styles } from './styles.js'

export const inject = ['slots', 'settingsScope']

const store = new UsageStore()
const RING_LENGTH = 2 * Math.PI * 9
// Anthropic logomark (simple-icons, CC0).
const ANTHROPIC_PATH = 'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z'

function severity(percent: number): '' | 'warn' | 'critical' {
  return percent >= 90 ? 'critical' : percent >= 70 ? 'warn' : ''
}

export function mainPlanUsedPercent(data: ClaudeUsageData | null): number {
  if (data === null) return 0
  return Math.max(
    data.session?.usedPercent ?? 0,
    data.weekly?.usedPercent ?? 0,
  )
}

function resetLabel(resetsAtMs: number | null): string {
  if (resetsAtMs === null) return 'Reset time unavailable'
  const date = new Date(resetsAtMs)
  const relativeMs = date.getTime() - Date.now()
  const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  if (relativeMs <= 0) return `Reset due · ${absolute}`
  const minutes = Math.ceil(relativeMs / 60_000)
  const relative = minutes < 60
    ? `in ${minutes}m`
    : minutes < 2880
      ? `in ${Math.ceil(minutes / 60)}h`
      : `in ${Math.ceil(minutes / 1440)}d`
  return `Resets ${relative} · ${absolute}`
}

function titleCase(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Unknown'
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function UsageWindow({ label, value }: { label: string; value: UsageWindow }) {
  const level = severity(value.usedPercent)
  return <div className="dcl-window">
    <div className="dcl-window-head">
      <span>{label}</span>
      <span className="dcl-percent">{Math.round(value.usedPercent)}% used</span>
    </div>
    <div className="dcl-bar" aria-hidden="true">
      <div className={`dcl-bar-fill${level === '' ? '' : ` dcl-bar-${level}`}`} style={{ width: `${value.usedPercent}%` }} />
    </div>
    <div className="dcl-reset">{resetLabel(value.resetsAt)}</div>
  </div>
}

function ScopedModel({ entry }: { entry: ScopedModelWindow }) {
  const level = severity(entry.usedPercent)
  return <div className="dcl-window">
    <div className="dcl-window-head">
      <span>{entry.modelLabel}</span>
      <span className="dcl-percent">{Math.round(entry.usedPercent)}% used</span>
    </div>
    <div className="dcl-bar" aria-hidden="true">
      <div className={`dcl-bar-fill${level === '' ? '' : ` dcl-bar-${level}`}`} style={{ width: `${entry.usedPercent}%` }} />
    </div>
    <div className="dcl-reset">{resetLabel(entry.resetsAt)}</div>
  </div>
}

function UsagePanel({ data, error, loading }: { data: ClaudeUsageData | null; error: string | null; loading: boolean }) {
  const plan = data?.account.planType ?? null
  const tier = data?.account.rateLimitTier ?? null
  const session = data?.session ?? null
  const weekly = data?.weekly ?? null
  const scoped = data?.weeklyScoped ?? []
  const extraUsage = data?.extraUsage ?? null
  const fetched = data === null ? null : new Date(data.fetchedAt)
  return <div className="dcl-panel" role="tooltip" id="dcl-usage-tooltip" onClick={event => { event.stopPropagation() }}>
    <div className="dcl-panel-header">
      <span className={`dcl-live${error === null ? '' : ' dcl-live-stale'}`} />
      <div>
        <div className="dcl-panel-title">Claude plan usage</div>
        <div className="dcl-panel-subtitle">{titleCase(plan)}{tier !== null && plan !== null ? ` · ${titleCase(tier)}` : ''} · Anthropic Claude</div>
      </div>
    </div>
    {error !== null && <div className="dcl-error">{error}{data !== null ? ' — showing the last successful update.' : ''}</div>}
    {loading && data === null && <div className="dcl-spinner" aria-label="Loading Claude usage" />}
    {!loading && data === null && error === null && <div className="dcl-empty">Hover to load usage details.</div>}
    {session !== null && <UsageWindow label="5-hour window" value={session} />}
    {weekly !== null && <UsageWindow label="Weekly window" value={weekly} />}
    {session === null && weekly === null && data !== null && <div className="dcl-empty">No rolling-window limits reported.</div>}
    {scoped.length > 0 && <section className="dcl-scoped">
      <div className="dcl-scoped-heading">Model-scoped weekly limits</div>
      {scoped.map((entry, index) => <ScopedModel key={`${entry.modelLabel}-${index}`} entry={entry} />)}
    </section>}
    {(tier !== null || extraUsage !== null) && <dl className="dcl-meta">
      {tier !== null && <><dt>Rate-limit tier</dt><dd>{titleCase(tier)}</dd></>}
      {extraUsage !== null && <><dt>Extra usage</dt><dd>{extraUsage.enabled ? (extraUsage.usedPercent === null ? 'Enabled' : `${Math.round(extraUsage.usedPercent)}% used`) : 'Off'}</dd></>}
    </dl>}
    <div className="dcl-footer">
      <span>{fetched === null ? 'Not updated yet' : `Updated ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(fetched)}`}</span>
      <span>{loading ? 'Refreshing…' : 'Hover refreshes'}</span>
    </div>
  </div>
}

export function ClaudeUsageIndicator() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [open, setOpen] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const percent = useMemo(() => mainPlanUsedPercent(state.data), [state.data])
  const level = severity(percent)

  const enter = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    closeTimer.current = null
    setOpen(true)
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => { void store.refresh(true) }, 250)
  }
  const leave = () => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      closeTimer.current = null
    }, 200)
  }
  const closeImmediately = () => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current)
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    hoverTimer.current = null
    closeTimer.current = null
    setOpen(false)
  }

  useEffect(() => () => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current)
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
  }, [])

  return <div className="dcl-usage-root" onMouseEnter={enter} onMouseLeave={leave}>
    <button
      type="button"
      className="dcl-meter"
      aria-label={`Claude usage: ${Math.round(percent)} percent used`}
      aria-describedby={open ? 'dcl-usage-tooltip' : undefined}
      aria-expanded={open}
      onFocus={enter}
      onBlur={leave}
      onClick={enter}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          closeImmediately()
          event.currentTarget.blur()
        }
      }}
    >
      <svg className="dcl-ring" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="dcl-track" cx="12" cy="12" r="9" />
        <circle className={`dcl-fill${level === '' ? '' : ` dcl-fill-${level}`}`} cx="12" cy="12" r="9" strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH * (1 - percent / 100)} />
      </svg>
      <svg className="dcl-logo" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={ANTHROPIC_PATH} /></svg>
      {state.phase === 'error' && <span className="dcl-status-dot" />}
    </button>
    {open && <UsagePanel data={state.data} error={state.error} loading={state.phase === 'loading'} />}
  </div>
}

interface SettingsCardProps {
  scope: SettingsScope<ClaudeUsageSettings>
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
  const [open, setOpen] = useState(false)
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

  return <li className="dcl-settings-card" data-open={open}>
    <button
      type="button"
      className="dcl-settings-header"
      aria-expanded={open}
      onClick={() => { setOpen(value => !value) }}
    >
      <span className="dcl-settings-heading">
        <span className="dcl-settings-title">Claude usage</span>
        <span className="dcl-settings-description">Configure provider refresh and credential lookup limits.</span>
      </span>
      {dirty ? <span className="dcl-settings-pending">Unsaved</span> : null}
      <svg className="dcl-settings-chevron" viewBox="0 0 20 20" aria-hidden="true">
        <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    {open ? <div className="dcl-settings-body">
      <p className="dcl-settings-notice">Saved Claude usage settings take effect after DSH Web restarts.</p>
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
    </div> : null}
  </li>
}

type FooterActionProps = PropsRuntime<'sidebar.footer.action'>

const FOOTER_COORDINATOR = Symbol.for('dsh.usage-footer-coordinator')

interface FooterCoordinator {
  register(anchor: HTMLElement): () => void
}

function isFooterCoordinator(value: unknown): value is FooterCoordinator {
  return typeof value === 'object' && value !== null
    && typeof (value as { register?: unknown }).register === 'function'
}

/**
 * One coordinator owns the whole footer row. Both usage bundles use the same
 * Symbol.for key, so independently loaded client bundles share one DOM/layout
 * writer instead of racing two MutationObservers over the same Settings button.
 */
function createFooterCoordinator(footerActions: HTMLElement): FooterCoordinator {
  const registered = new Set<HTMLElement>()
  const inactive = new Set<HTMLElement>()
  let settingsTrigger: HTMLButtonElement | null = null
  let originalWidth: string | null = null
  let observedSettingsArea: HTMLElement | null = null
  let resizeObserver: ResizeObserver | null = null
  let disposed = false

  const usageAnchors = (): HTMLElement[] => {
    const current = new Set<HTMLElement>(footerActions.querySelectorAll<HTMLElement>('[data-dsh-usage-footer-action]'))
    for (const anchor of registered) current.add(anchor)
    return [...current].filter(anchor => !inactive.has(anchor) && footerActions.contains(anchor) && anchor.isConnected)
  }

  const hide = (anchor: HTMLElement) => {
    anchor.style.visibility = 'hidden'
    anchor.style.removeProperty('--dcl-panel-available-width')
    anchor.style.removeProperty('--dcu-panel-available-width')
  }

  const releaseTrigger = () => {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (settingsTrigger !== null && originalWidth !== null) settingsTrigger.style.width = originalWidth
    settingsTrigger = null
    originalWidth = null
    observedSettingsArea = null
  }

  const position = () => {
    if (disposed) return
    const settingsArea = footerActions.nextElementSibling instanceof HTMLElement
      ? footerActions.nextElementSibling
      : null
    const candidate = settingsArea?.querySelector('button')
    const current = usageAnchors()
    if (settingsArea === null || !(candidate instanceof HTMLButtonElement)) {
      releaseTrigger()
      for (const anchor of current) hide(anchor)
      return
    }
    if (candidate !== settingsTrigger || settingsArea !== observedSettingsArea) {
      releaseTrigger()
      settingsTrigger = candidate
      originalWidth = candidate.style.width
      observedSettingsArea = settingsArea
      resizeObserver = new ResizeObserver(position)
      resizeObserver.observe(candidate)
      resizeObserver.observe(footerActions)
      resizeObserver.observe(settingsArea)
    }
    current.sort((a, b) => {
      if (a === b) return 0
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    })
    candidate.style.width = 'calc(100% - ' + (34 * current.length) + 'px)'
    const rect = candidate.getBoundingClientRect()
    current.forEach((anchor, index) => {
      const left = rect.right + 4 + index * 32
      anchor.style.left = String(left) + 'px'
      anchor.style.top = String(rect.top + (rect.height - 28) / 2) + 'px'
      const available = String(Math.max(0, left + 28 - 12)) + 'px'
      // Each provider keeps its own variable, while the coordinator writes both
      // so a mixed old/new client deployment still receives one placement pass.
      anchor.style.setProperty('--dcl-panel-available-width', available)
      anchor.style.setProperty('--dcu-panel-available-width', available)
      anchor.style.visibility = 'visible'
    })
  }

  const observedRoot = footerActions.parentElement ?? footerActions
  const mutationObserver = new MutationObserver(position)
  mutationObserver.observe(observedRoot, { childList: true, subtree: true })

  const coordinator: FooterCoordinator = {
    register(anchor) {
      registered.add(anchor)
      inactive.delete(anchor)
      anchor.style.visibility = 'hidden'
      position()
      return () => {
        if (!registered.delete(anchor)) return
        inactive.add(anchor)
        hide(anchor)
        if (usageAnchors().length === 0) {
          dispose()
        } else {
          position()
        }
      }
    },
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    mutationObserver.disconnect()
    releaseTrigger()
    for (const anchor of registered) hide(anchor)
    registered.clear()
    const record = footerActions as unknown as { [key: symbol]: unknown }
    if (record[FOOTER_COORDINATOR] === coordinator) delete record[FOOTER_COORDINATOR]
  }

  // register() can only run after this object exists; the callback is invoked
  // later by the MutationObserver/ResizeObserver event loop.
  const record = footerActions as unknown as { [key: symbol]: unknown }
  record[FOOTER_COORDINATOR] = coordinator
  position()
  return coordinator
}

function footerCoordinatorFor(footerActions: HTMLElement): FooterCoordinator {
  const record = footerActions as unknown as { [key: symbol]: unknown }
  const existing = record[FOOTER_COORDINATOR]
  if (isFooterCoordinator(existing)) return existing
  return createFooterCoordinator(footerActions)
}

export function bindFooterMeter(anchor: HTMLDivElement): () => void {
  const slotWrapper = anchor.closest('[data-slot="sidebar.footer.action"]')
  const footerActions = slotWrapper?.parentElement ?? anchor.parentElement
  if (!(footerActions instanceof HTMLElement)) return () => {}
  return footerCoordinatorFor(footerActions).register(anchor)
}

export function FooterUsageAction({ wide }: FooterActionProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!wide || anchorRef.current === null) return () => {}
    return bindFooterMeter(anchorRef.current)
  }, [wide])
  if (!wide) return null
  return <div ref={anchorRef} className="dcl-footer-action-anchor" data-dsh-usage-footer-action="claude"><ClaudeUsageIndicator /></div>
}

export function apply(ctx: ClientContext): void {
  const settingsScope = ctx.settingsScope.bind<ClaudeUsageSettings>({
    namespace: 'claude-usage',
    decode: decodeClaudeUsageSettings,
  })

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

  const SettingsCard = (): JSX.Element | null => <ClaudeUsageSettingsCard scope={settingsScope} />
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'claude-usage',
  }, SettingsCard))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'claude-usage',
    order: 100,
    label: 'Claude usage',
  }, FooterUsageAction))
}
