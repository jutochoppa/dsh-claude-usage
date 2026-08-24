// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClaudeUsageIndicator } from '../src/client/index.js'

const reactGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
beforeAll(() => { reactGlobal.IS_REACT_ACT_ENVIRONMENT = true })
afterAll(() => { delete reactGlobal.IS_REACT_ACT_ENVIRONMENT })

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => { root.render(<ClaudeUsageIndicator />) })
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
  vi.useRealTimers()
})

function mouse(type: 'mouseover' | 'mouseout', target: Element, relatedTarget: EventTarget | null): void {
  act(() => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget }))
  })
}

describe('usage panel hover interaction', () => {
  it('stays open while the pointer crosses the gap into the panel', () => {
    const usageRoot = container.querySelector('.dcl-usage-root')
    expect(usageRoot).toBeInstanceOf(HTMLElement)
    mouse('mouseover', usageRoot!, null)
    expect(container.querySelector('.dcl-panel')).not.toBeNull()

    mouse('mouseout', usageRoot!, document.body)
    act(() => { vi.advanceTimersByTime(199) })
    const panel = container.querySelector('.dcl-panel')
    expect(panel).not.toBeNull()

    mouse('mouseover', panel!, document.body)
    act(() => { vi.advanceTimersByTime(1) })
    expect(container.querySelector('.dcl-panel')).not.toBeNull()

    mouse('mouseout', panel!, document.body)
    act(() => { vi.advanceTimersByTime(200) })
    expect(container.querySelector('.dcl-panel')).toBeNull()
  })
})
