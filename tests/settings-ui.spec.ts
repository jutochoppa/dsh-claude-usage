import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'

const captured = vi.hoisted(() => ({
  options: [] as unknown[],
  reads: [] as boolean[],
}))

vi.mock('../src/usage-service.js', () => ({
  UsageService: class {
    constructor(options: unknown) { captured.options.push(options) }
    dispose(): void {}
    async read(force: boolean) {
      captured.reads.push(force)
      return { ok: true, data: { source: 'claude-oauth-usage' }, policy: { refreshIntervalMs: 300_000, hoverRefreshMinAgeMs: 30_000 } }
    }
  },
}))

import {
  Config, ROUTE, SETTINGS_NAMESPACE, apply, assertConfig, readSettings,
  type Config as PluginConfig, type Settings,
} from '../src/index.js'

interface RegisteredRoute {
  path: string
  methods: readonly string[]
  requestBody: string
  fetch: (request: Request) => Promise<Response>
}

function fakeVolatile<T>(read: () => T) {
  return { get: read }
}

function mountHost(config: PluginConfig) {
  const routes: RegisteredRoute[] = []
  const configured: Array<{ presentation: unknown; owner: unknown }> = []
  const fiber = { id: 'claude-usage-fiber' }
  const child = {
    effect: (mount: () => unknown) => { mount() },
    settings: {
      configure(presentation: unknown, owner: unknown) {
        configured.push({ presentation, owner })
        return () => {}
      },
    },
  }
  const context = {
    fiber,
    effect: (mount: () => unknown) => { mount() },
    inject: (_deps: string[], callback: (ctx: typeof child) => void) => { callback(child) },
    connection: {
      fetch: {
        register(route: RegisteredRoute) {
          routes.push(route)
          return async () => {}
        },
      },
    },
  } as unknown as Context
  apply(context, config)
  return { routes, configured, fiber }
}

describe('claude usage Host settings (DSH 0.2)', () => {
  it('uses the profile entry id and live, validated fields', () => {
    expect(SETTINGS_NAMESPACE).toBe('claude-usage')
    const defaults = readSettings(Config({}) as PluginConfig)
    expect(defaults).toEqual({
      refreshIntervalMs: 300_000,
      hoverRefreshMinAgeMs: 30_000,
      requestTimeoutMs: 15_000,
      credentialsFile: '',
    })
    expect(() => assertConfig({ ...defaults, refreshIntervalMs: 59_999 })).toThrow('refreshIntervalMs')
    expect(() => assertConfig({ ...defaults, hoverRefreshMinAgeMs: 4_999 })).toThrow('hoverRefreshMinAgeMs')
    expect(() => assertConfig({ ...defaults, requestTimeoutMs: 999 })).toThrow('requestTimeoutMs')
    expect(() => assertConfig({ ...defaults, credentialsFile: undefined as unknown as string })).toThrow('credentialsFile')
    expect(() => assertConfig({ ...defaults, credentialsFile: '' })).not.toThrow()
    expect(() => Config({ refreshIntervalMs: 59_999 })).toThrow()
  })

  it('marks every field volatile so Settings edits apply live', () => {
    const schema = Config as unknown as { dict: Record<string, { meta?: { volatile?: boolean } }> }
    for (const field of ['refreshIntervalMs', 'hoverRefreshMinAgeMs', 'requestTimeoutMs', 'credentialsFile']) {
      expect(schema.dict[field]?.meta?.volatile).toBe(true)
    }
  })

  it('hands the usage service a getter that follows live config', () => {
    captured.options.length = 0
    let live: Settings = {
      refreshIntervalMs: 120_000,
      hoverRefreshMinAgeMs: 10_000,
      requestTimeoutMs: 5_000,
      credentialsFile: 'C:\\Claude\\.credentials.json',
    }
    const config: PluginConfig = {
      refreshIntervalMs: fakeVolatile(() => live.refreshIntervalMs),
      hoverRefreshMinAgeMs: fakeVolatile(() => live.hoverRefreshMinAgeMs),
      requestTimeoutMs: fakeVolatile(() => live.requestTimeoutMs),
      credentialsFile: fakeVolatile(() => live.credentialsFile),
    }
    const { configured, fiber } = mountHost(config)
    const getter = captured.options[0] as () => Settings
    expect(getter()).toEqual(live)
    live = { ...live, refreshIntervalMs: 600_000 }
    expect(getter().refreshIntervalMs).toBe(600_000)
    expect(configured).toEqual([{ presentation: { auto: false }, owner: fiber }])
  })

  it('serves usage through an authenticated GET-only connection route', async () => {
    captured.reads.length = 0
    const { routes } = mountHost(Config({}) as PluginConfig)
    expect(routes).toHaveLength(1)
    const route = routes[0]!
    expect(route).toMatchObject({ path: ROUTE, methods: ['GET'], requestBody: 'buffered' })
    expect(ROUTE.startsWith('/api/')).toBe(true)

    const forced = await route.fetch(new Request(`http://localhost${ROUTE}?refresh=1`))
    expect(forced.status).toBe(200)
    expect(forced.headers.get('cache-control')).toBe('no-store')
    expect(await forced.json()).toMatchObject({ ok: true })
    await route.fetch(new Request(`http://localhost${ROUTE}`))
    expect(captured.reads).toEqual([true, false])
  })
})
