import { describe, expect, it } from 'vitest'
import { normalizeUsage } from '../src/normalize.js'

describe('normalizeUsage', () => {
  it('allowlists limit fields, clamps percentages, and drops unknown fields', () => {
    const value = normalizeUsage({
      limits: [
        { kind: 'session', percent: 132.4, resets_at: '2026-07-29T12:00:00Z' },
        { kind: 'weekly_all', percent: -4, resets_at: '2026-08-03T00:00:00Z' },
        {
          kind: 'weekly_scoped',
          percent: 42.5,
          is_active: true,
          resets_at: '2026-08-03T00:00:00Z',
          scope: { model: { display_name: 'Opus' }, surface: 'claude_code' },
        },
        { kind: 'weekly_scoped', percent: 99, is_active: false, scope: { model: { display_name: 'Inactive' } } },
      ],
      five_hour: { utilization: 11, resets_at: '2026-07-29T12:00:00Z' },
      access_token: 'drop-me',
      user_id: 'drop-me',
      extra_usage: { is_enabled: true, utilization: 55.5, secret: 'drop-me' },
    }, { planType: 'max', rateLimitTier: 'tier_40' }, 1234)

    expect(value.fetchedAt).toBe(1234)
    expect(value.source).toBe('claude-oauth-usage')
    expect(value.session).toEqual({ usedPercent: 100, resetsAt: Date.parse('2026-07-29T12:00:00Z') })
    expect(value.weekly).toEqual({ usedPercent: 0, resetsAt: Date.parse('2026-08-03T00:00:00Z') })
    expect(value.weeklyScoped).toEqual([
      { modelLabel: 'Opus', usedPercent: 42.5, resetsAt: Date.parse('2026-08-03T00:00:00Z') },
    ])
    expect(value.extraUsage).toEqual({ enabled: true, usedPercent: 55.5 })
    expect(value.account).toEqual({ planType: 'max', rateLimitTier: 'tier_40' })
    expect(JSON.stringify(value)).not.toContain('drop-me')
  })

  it('falls back to the legacy five_hour/seven_day shapes when limits are absent', () => {
    const value = normalizeUsage({
      five_hour: { utilization: 33.4, resets_at: '2026-07-29T12:00:00Z' },
      seven_day: {},
      futureField: { anything: true },
    }, { planType: null, rateLimitTier: null })

    expect(value.session?.usedPercent).toBe(33.4)
    expect(value.weekly).toBeNull()
    expect(value.weeklyScoped).toEqual([])
    expect(value.extraUsage).toBeNull()
    expect(value.account).toEqual({ planType: null, rateLimitTier: null })
  })

  it('tolerates missing and malformed payloads', () => {
    const value = normalizeUsage(null, { planType: null, rateLimitTier: null })
    expect(value.session).toBeNull()
    expect(value.weekly).toBeNull()
    expect(value.weeklyScoped).toEqual([])
    expect(value.extraUsage).toBeNull()
    expect(value.source).toBe('claude-oauth-usage')
  })
})
