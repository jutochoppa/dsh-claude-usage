import { afterEach, describe, expect, it, vi } from 'vitest'
import { CredentialsUnavailableError, type ClaudeCredentials } from '../src/credentials.js'
import { UsageService, type UsageServiceDeps, type UsageServiceOptions } from '../src/usage-service.js'

const options: UsageServiceOptions = {
  refreshIntervalMs: 300_000,
  hoverRefreshMinAgeMs: 30_000,
  requestTimeoutMs: 15_000,
  credentialsFile: '',
}

function credentials(overrides: Partial<ClaudeCredentials> = {}): ClaudeCredentials {
  return {
    accessToken: 'token-under-test',
    expiresAtMs: Date.now() + 3_600_000,
    planType: 'max',
    rateLimitTier: 'tier_40',
    ...overrides,
  }
}

function deps(
  load: () => Promise<ClaudeCredentials> = async () => credentials(),
  fetchUsage: UsageServiceDeps['fetchUsage'] = async () => ({ kind: 'success', payload: {} }),
): UsageServiceDeps {
  return { readCredentials: load, fetchUsage }
}

const payload = {
  limits: [{ kind: 'session', percent: 20, resets_at: '2026-07-29T12:00:00Z' }],
}

afterEach(() => { vi.useRealTimers() })

describe('UsageService', () => {
  it('uses the long poll cache and shorter forced-hover cache', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const fetchUsage = vi.fn(async () => ({ kind: 'success' as const, payload }))
    const service = new UsageService(options, deps(undefined, fetchUsage))

    await service.read(false)
    expect(fetchUsage).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(31_000)
    await service.read(false)
    expect(fetchUsage).toHaveBeenCalledTimes(1)
    await service.read(true)
    expect(fetchUsage).toHaveBeenCalledTimes(2)
  })

  it('throttles failed attempts and never echoes provider internals', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const fetchUsage = vi.fn(async () => ({ kind: 'unavailable' as const, message: 'private local path' }))
    const service = new UsageService(options, deps(undefined, fetchUsage))

    const first = await service.read(true)
    const second = await service.read(true)
    expect(fetchUsage).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.error.message).not.toContain('private local path')
  })

  it('keeps the coalescing fence until the provider call settles', async () => {
    let finish!: (value: Awaited<ReturnType<NonNullable<UsageServiceDeps['fetchUsage']>>>) => void
    const pending = new Promise(resolve => { finish = resolve })
    const fetchUsage = vi.fn(() => pending)
    const service = new UsageService(options, deps(undefined, fetchUsage))
    let settled = false
    const read = service.read(true).then(value => { settled = true; return value })
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)
    const concurrent = service.read(true)
    expect(fetchUsage).toHaveBeenCalledTimes(1)
    finish({ kind: 'success', payload })
    const [first, second] = await Promise.all([read, concurrent])
    expect(first).toBe(second)
    expect(first.ok).toBe(true)
  })

  it('reports missing credentials without touching the network', async () => {
    const fetchUsage = vi.fn(async () => ({ kind: 'success' as const, payload }))
    const service = new UsageService(options, {
      readCredentials: async () => { throw new CredentialsUnavailableError('missing') },
      fetchUsage,
    })
    const result = await service.read(true)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('CLAUDE_CREDENTIALS_UNAVAILABLE')
      expect(result.error.message).not.toContain('missing')
    }
    expect(fetchUsage).not.toHaveBeenCalled()
  })

  it('short-circuits expired tokens before the network call', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const fetchUsage = vi.fn(async () => ({ kind: 'success' as const, payload }))
    const service = new UsageService(options, deps(async () => credentials({ expiresAtMs: 999_000 }), fetchUsage))
    const result = await service.read(true)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CLAUDE_TOKEN_EXPIRED')
    expect(fetchUsage).not.toHaveBeenCalled()
  })

  it('maps auth rejection onto a sign-in error', async () => {
    const fetchUsage = vi.fn(async () => ({ kind: 'auth-expired' as const }))
    const service = new UsageService(options, deps(undefined, fetchUsage))
    const result = await service.read(true)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CLAUDE_AUTH_REQUIRED')
  })

  it('honors Retry-After cooldowns across poll boundaries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const fetchUsage = vi.fn(async () => ({ kind: 'rate-limited' as const, retryAfterMs: 600_000 }))
    const service = new UsageService(options, deps(undefined, fetchUsage))

    const limited = await service.read(true)
    expect(limited.ok).toBe(false)
    if (!limited.ok) expect(limited.error.code).toBe('CLAUDE_USAGE_RATE_LIMITED')

    vi.advanceTimersByTime(301_000)
    const stillCooling = await service.read(false)
    expect(fetchUsage).toHaveBeenCalledTimes(1)
    expect(stillCooling.ok).toBe(false)

    vi.advanceTimersByTime(301_000)
    await service.read(false)
    expect(fetchUsage).toHaveBeenCalledTimes(2)
  })

  it('attaches credential-derived plan metadata to normalized data', async () => {
    const fetchUsage = vi.fn(async () => ({ kind: 'success' as const, payload }))
    const service = new UsageService(options, deps(async () => credentials({ planType: 'pro', rateLimitTier: null }), fetchUsage))
    const result = await service.read(true)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.account).toEqual({ planType: 'pro', rateLimitTier: null })
  })
})
