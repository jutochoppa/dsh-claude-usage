// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, ClaudeUsageSettingsCard } from '../src/client/index.js'
import {
  buildSettingsWritePlan,
  decodeClaudeUsageSettings,
  parseSettingsDraft,
  saveClaudeUsageSettings,
  settingsToDraft,
  type ClaudeUsageSettings,
  type ClaudeUsageSettingsScope,
} from '../src/client/settings.js'

const reactGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
beforeAll(() => { reactGlobal.IS_REACT_ACT_ENVIRONMENT = true })
afterAll(() => { delete reactGlobal.IS_REACT_ACT_ENVIRONMENT })

const defaults: ClaudeUsageSettings = {
  refreshIntervalMs: 300_000,
  hoverRefreshMinAgeMs: 30_000,
  requestTimeoutMs: 15_000,
  credentialsFile: '',
}

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('claude usage client settings', () => {
  it('decodes and validates every field without rewriting path text', () => {
    expect(decodeClaudeUsageSettings(defaults)).toEqual(defaults)
    expect(decodeClaudeUsageSettings({ ...defaults, requestTimeoutMs: 999 })).toBeUndefined()
    expect(decodeClaudeUsageSettings({ ...defaults, credentialsFile: 42 as unknown as string })).toBeUndefined()
    expect(parseSettingsDraft({ ...settingsToDraft(defaults), credentialsFile: '  C:\\Claude\\creds.json  ' }).credentialsFile)
      .toBe('  C:\\Claude\\creds.json  ')
    expect(parseSettingsDraft(settingsToDraft(defaults)).credentialsFile).toBe('')
    expect(() => parseSettingsDraft({ ...settingsToDraft(defaults), refreshIntervalMs: '1.5' })).toThrow('whole number')
  })

  it('builds changed-only writes and saves with revision drift protection', async () => {
    const target = { ...defaults, refreshIntervalMs: 600_000, credentialsFile: '/home/user/.claude/.credentials.json' }
    expect(buildSettingsWritePlan(defaults, target)).toEqual([
      { field: 'refreshIntervalMs', value: 600_000 },
      { field: 'credentialsFile', value: '/home/user/.claude/.credentials.json' },
    ])

    let value = defaults
    let revision = 7
    const writes: string[] = []
    const scope: ClaudeUsageSettingsScope = {
      getSnapshot: () => ({ status: 'ready', value, revision }),
      set: async (field, next) => {
        writes.push(field)
        value = { ...value, [field]: next } as ClaudeUsageSettings
        revision += 1
      },
    }
    await saveClaudeUsageSettings(scope, target, 7)
    expect(writes).toEqual(['refreshIntervalMs', 'credentialsFile'])
    expect(value).toEqual(target)
  })

  it('rejects stale drafts and drift between sequential writes', async () => {
    let staleWrites = 0
    await expect(saveClaudeUsageSettings({
      getSnapshot: () => ({ status: 'ready', value: defaults, revision: 3 }),
      set: async () => { staleWrites += 1 },
    }, { ...defaults, requestTimeoutMs: 20_000 }, 2)).rejects.toThrow('changed while editing')
    expect(staleWrites).toBe(0)

    let value = defaults
    let revision = 9
    const scope: ClaudeUsageSettingsScope = {
      getSnapshot: () => ({ status: 'ready', value, revision }),
      set: async (field, next) => {
        value = { ...value, [field]: next, credentialsFile: 'external-path' } as ClaudeUsageSettings
        revision += 1
      },
    }
    await expect(saveClaudeUsageSettings(scope, {
      ...defaults,
      refreshIntervalMs: 600_000,
      requestTimeoutMs: 20_000,
    }, 9)).rejects.toThrow('changed while saving')
  })

  it('binds the namespace and registers the canonical plugin card slot', () => {
    let namespace: string | undefined
    const slots: Array<{ name: string; key?: string; id?: string }> = []
    const context = {
      settingsScope: { bind: (spec: { namespace: string }) => { namespace = spec.namespace; return {} } },
      effect: () => {},
      slots: {
        inject: (_name: string, mount: () => unknown) => { mount() },
        register: (spec: { name: string; key?: string; id?: string }) => { slots.push(spec); return () => {} },
      },
    } as unknown as ClientContext
    apply(context)
    expect(namespace).toBe('claude-usage')
    expect(slots).toContainEqual({ name: 'settings.plugin.item', key: 'claude-usage' })
    expect(slots).toContainEqual(expect.objectContaining({ name: 'sidebar.footer.action', id: 'claude-usage' }))
  })

  it('renders a collapsible four-field staged form with restart notice and validation', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const set = vi.fn(async () => {})
    const snapshot = { status: 'ready' as const, value: defaults, revision: 1, writable: true, mode: 'persistent' as const }
    const scope = {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
      set,
    } as unknown as SettingsScope<ClaudeUsageSettings>
    const root = createRoot(container)
    act(() => { root.render(<ClaudeUsageSettingsCard scope={scope} />) })
    expect(container.querySelectorAll('input')).toHaveLength(0)
    act(() => { (container.querySelector('.dcl-settings-header') as HTMLButtonElement).click() })
    expect(container.querySelectorAll('input')).toHaveLength(4)
    expect(container.querySelector('input[aria-label="Credentials file"]')).not.toBeNull()
    expect(container.textContent).toContain('take effect after DSH Web restarts')
    const interval = container.querySelector('input[aria-label="Background refresh interval"]') as HTMLInputElement
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setValue?.call(interval, '1.5')
      interval.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('whole number')
    expect(set).not.toHaveBeenCalled()
    act(() => { root.unmount() })
  })
})
