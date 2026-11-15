// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { UsageCardView } from '../src/client/index.js'
import type { UsageState } from '../src/client/store.js'
import type { ClaudeUsageData } from '../src/types.js'

const reactGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
beforeAll(() => { reactGlobal.IS_REACT_ACT_ENVIRONMENT = true })
afterAll(() => { delete reactGlobal.IS_REACT_ACT_ENVIRONMENT })

const policy = { refreshIntervalMs: 300_000, hoverRefreshMinAgeMs: 30_000 }

const data: ClaudeUsageData = {
  source: 'claude-oauth-usage',
  fetchedAt: Date.parse('2026-11-15T13:40:00Z'),
  account: { planType: 'max', rateLimitTier: 'default_claude_max_5x' },
  session: { usedPercent: 24, resetsAt: Date.parse('2026-11-15T17:00:00Z') },
  weekly: { usedPercent: 23.4, resetsAt: Date.parse('2026-11-20T17:23:00Z') },
  weeklyScoped: [],
  extraUsage: { enabled: false, usedPercent: null },
}

function state(overrides: Partial<UsageState>): UsageState {
  return { phase: 'ready', data, error: null, policy, lastAttemptAt: 0, ...overrides }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
})

describe('Codex-style Claude usage card', () => {
  it('renders the wide card with header, limit rows, remaining share and resets', () => {
    act(() => { root.render(<UsageCardView state={state({})} wide />) })
    const card = container.querySelector('.dcl-card')
    expect(card?.classList.contains('dcl-wide')).toBe(true)
    expect(card?.parentElement).toBe(container)
    expect(card?.getAttribute('title')).toBe('Max plan · Default Claude Max 5x')
    expect(container.querySelector('.dcl-title')?.textContent).toBe('Claude usage')
    expect(container.querySelector('.dcl-logo')).not.toBeNull()

    const titles = [...container.querySelectorAll('.dcl-limit-title')].map(node => node.textContent)
    expect(titles).toEqual(['5-hour limit', 'Weekly limit'])
    const used = [...container.querySelectorAll('.dcl-used')].map(node => node.textContent)
    expect(used).toEqual(['Remaining 76%', 'Remaining 77%'])
    const bars = [...container.querySelectorAll('[role="progressbar"]')]
    expect(bars.map(bar => bar.getAttribute('aria-valuenow'))).toEqual(['76', '77'])
    expect((container.querySelector('.dcl-fill') as HTMLElement).style.width).toBe('76%')
    for (const reset of container.querySelectorAll('.dcl-reset')) expect(reset.textContent).toMatch(/ Reset$/)
    expect(container.querySelector('.dcl-notice')).toBeNull()
  })

  it('uses compact labels in the collapsed rail', () => {
    act(() => { root.render(<UsageCardView state={state({})} wide={false} />) })
    expect(container.querySelector('.dcl-card')?.classList.contains('dcl-wide')).toBe(false)
    const titles = [...container.querySelectorAll('.dcl-limit-title')].map(node => node.textContent)
    expect(titles).toEqual(['5h', 'Week'])
    const used = [...container.querySelectorAll('.dcl-used')].map(node => node.textContent)
    expect(used).toEqual(['76% left', '77% left'])
  })

  it('shows loading, error, and stale-data notices', () => {
    act(() => { root.render(<UsageCardView state={state({ phase: 'loading', data: null })} wide />) })
    expect(container.querySelector('.dcl-notice')?.textContent).toBe('Loading usage…')
    expect(container.querySelector('.dcl-limit')).toBeNull()

    act(() => { root.render(<UsageCardView state={state({ phase: 'error', data: null, error: 'Run claude login to sign in again.' })} wide />) })
    expect(container.querySelector('.dcl-notice')?.textContent).toBe('Run claude login to sign in again.')

    act(() => { root.render(<UsageCardView state={state({ phase: 'error', error: 'Unable to read Claude plan usage right now.' })} wide />) })
    expect(container.querySelector('.dcl-notice')?.textContent).toBe('Refresh failed; showing the last available usage.')
    expect(container.querySelectorAll('.dcl-limit')).toHaveLength(2)
  })
})
