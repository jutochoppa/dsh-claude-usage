// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, ClaudeUsageSettingsCard } from '../src/client/index.js'
import {
  buildSettingsWritePlan,
  decodeClaudeUsageSettings,
  parseSettingsDraft,
  saveClaudeUsageSettings,
  settingsToDraft,
  type ClaudeUsageSettings,
  type ClaudeUsageSettingsScope,
  type SettingsSetOp,
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

  it('saves only changed fields in one revision-fenced mutation', async () => {
    const target = { ...defaults, refreshIntervalMs: 600_000, credentialsFile: '/home/user/.claude/.credentials.json' }
    expect(buildSettingsWritePlan(defaults, target)).toEqual([
      { field: 'refreshIntervalMs', value: 600_000 },
      { field: 'credentialsFile', value: '/home/user/.claude/.credentials.json' },
    ])

    const calls: Array<{ ops: readonly SettingsSetOp[]; revision: number | undefined }> = []
    const scope: ClaudeUsageSettingsScope = {
      getSnapshot: () => ({ status: 'ready', value: defaults, revision: 7 }),
      mutate: async (ops, revision) => { calls.push({ ops, revision }); return true },
    }
    await saveClaudeUsageSettings(scope, target, 7)
    expect(calls).toEqual([{
      ops: [
        { op: 'set', path: ['refreshIntervalMs'], value: 600_000 },
        { op: 'set', path: ['credentialsFile'], value: '/home/user/.claude/.credentials.json' },
      ],
      revision: 7,
    }])

    calls.length = 0
    await saveClaudeUsageSettings(scope, defaults, 7)
    expect(calls).toEqual([])
  })

  it('rejects stale drafts and Host-refused writes', async () => {
    let writes = 0
    await expect(saveClaudeUsageSettings({
      getSnapshot: () => ({ status: 'ready', value: defaults, revision: 3 }),
      mutate: async () => { writes += 1; return true },
    }, { ...defaults, requestTimeoutMs: 20_000 }, 2)).rejects.toThrow('changed while editing')
    expect(writes).toBe(0)

    await expect(saveClaudeUsageSettings({
      getSnapshot: () => ({ status: 'ready', value: defaults, revision: 9 }),
      mutate: async () => false,
    }, { ...defaults, requestTimeoutMs: 20_000 }, 9)).rejects.toThrow('changed while saving')

    await expect(saveClaudeUsageSettings({
      getSnapshot: () => ({ status: 'loading', value: undefined, revision: undefined }),
      mutate: async () => true,
    }, defaults, 1)).rejects.toThrow('not ready')
  })

  it('reads the configForms entry and registers the DSH 0.2 slots', () => {
    let namespace: string | undefined
    const slots: Array<{ name: string; id?: string; label?: string }> = []
    const context = {
      configForms: { get: (entryId: string) => { namespace = entryId; return {} } },
      effect: () => {},
      slots: {
        inject: (_name: string, mount: () => unknown) => { mount() },
        register: (spec: { name: string; id?: string; label?: string }) => { slots.push(spec); return () => {} },
      },
    } as unknown as Context
    apply(context)
    expect(namespace).toBe('claude-usage')
    expect(slots).toContainEqual(expect.objectContaining({ name: 'settings.plugins.tab', id: 'claude-usage', label: 'Claude usage' }))
    expect(slots).toContainEqual(expect.objectContaining({ name: 'sidebar.footer.action', id: 'claude-usage' }))
    expect(slots.map(slot => slot.name)).not.toContain('settings.plugin.item')
  })

  it('renders a four-field staged form with a live-apply notice and validation', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const mutate = vi.fn(async () => true)
    const snapshot = { status: 'ready' as const, value: defaults, base: undefined, user: undefined, revision: 1, writable: true }
    const scope = {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
      mutate,
      set: vi.fn(),
      unset: vi.fn(),
    } as unknown as ConfigForm<ClaudeUsageSettings>
    const root = createRoot(container)
    act(() => { root.render(<ClaudeUsageSettingsCard scope={scope} />) })
    expect(container.querySelectorAll('input')).toHaveLength(4)
    expect(container.querySelector('input[aria-label="Credentials file"]')).not.toBeNull()
    expect(container.textContent).toContain('apply immediately')
    expect(container.textContent).not.toContain('restarts')
    const interval = container.querySelector('input[aria-label="Background refresh interval"]') as HTMLInputElement
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setValue?.call(interval, '1.5')
      interval.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('whole number')
    expect(mutate).not.toHaveBeenCalled()
    act(() => { root.unmount() })
  })

  it('hides the card when the Host does not serve the namespace', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const unavailable = { status: 'unavailable' as const, value: undefined, base: undefined, user: undefined, revision: undefined, writable: false }
    const scope = {
      subscribe: () => () => {},
      getSnapshot: () => unavailable,
    } as unknown as ConfigForm<ClaudeUsageSettings>
    const root = createRoot(container)
    act(() => { root.render(<ClaudeUsageSettingsCard scope={scope} />) })
    expect(container.innerHTML).toBe('')
    act(() => { root.unmount() })
  })
})
