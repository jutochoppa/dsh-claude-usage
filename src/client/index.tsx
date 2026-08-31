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
// Claude logomark (simple-icons, CC0).
const CLAUDE_PATH = 'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z'

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
      title="Claude usage"
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
        <circle className={`dcl-fill${level === '' ? '' : ` dcl-fill-${level}`}`} cx="12" cy="12" r="9" strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH * (1 - percent / 100)} />
      </svg>
      <svg className="dcl-logo" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={CLAUDE_PATH} /></svg>
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
    // Keep the footer order stable even when providers mount asynchronously.
    // Claude is the first lane, Codex the second; unknown providers retain DOM order.
    const providerRank = (anchor: HTMLElement): number => {
      const provider = anchor.dataset.dshUsageFooterAction
      return provider === 'claude' ? 0 : provider === 'codex' ? 1 : 2
    }
    current.sort((a, b) => {
      const rankDifference = providerRank(a) - providerRank(b)
      if (rankDifference !== 0) return rankDifference
      if (a === b) return 0
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    })
    // Reserve lanes inside the Settings row instead of placing meters after its
    // right edge (which can be the sidebar boundary). Measure that boundary
    // before narrowing the trigger, then right-align every meter within it.
    const rect = candidate.getBoundingClientRect()
    candidate.style.width = 'calc(100% - ' + (34 * current.length) + 'px)'
    current.forEach((anchor, index) => {
      const left = rect.right - 28 - (current.length - 1 - index) * 32
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
