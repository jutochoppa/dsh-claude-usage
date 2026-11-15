import { describe, expect, it } from 'vitest'
import { cardLimits, remainingPercent } from '../src/client/index.js'
import { normalizeUsage } from '../src/normalize.js'

describe('Claude usage card rows', () => {
  it('lists 5-hour, weekly, then model-scoped weekly limits', () => {
    const data = normalizeUsage({
      limits: [
        { kind: 'session', percent: 31, resets_at: '2026-07-29T12:00:00Z' },
        { kind: 'weekly_all', percent: 47, resets_at: '2026-08-03T00:00:00Z' },
        { kind: 'weekly_scoped', percent: 94, is_active: true, scope: { model: { display_name: 'Opus' } } },
      ],
    }, { planType: 'max', rateLimitTier: null })

    const rows = cardLimits(data)
    expect(rows.map(row => [row.label, row.shortLabel, row.includeDate])).toEqual([
      ['5-hour limit', '5h', false],
      ['Weekly limit', 'Week', true],
      ['Weekly limit · Opus', 'Opus', true],
    ])
    expect(rows.map(row => remainingPercent(row.window.usedPercent))).toEqual([69, 53, 6])
  })

  it('omits the 5-hour row when the plan reports only a weekly window', () => {
    const data = normalizeUsage({
      limits: [{ kind: 'weekly_all', percent: 10, resets_at: '2026-08-03T00:00:00Z' }],
    }, { planType: 'pro', rateLimitTier: null })
    expect(cardLimits(data).map(row => row.key)).toEqual(['weekly'])
  })

  it('has no rows before the first response or when no windows are reported', () => {
    expect(cardLimits(null)).toEqual([])
    expect(cardLimits(normalizeUsage({}, { planType: null, rateLimitTier: null }))).toEqual([])
  })

  it('clamps and rounds the remaining share', () => {
    expect(remainingPercent(0)).toBe(100)
    expect(remainingPercent(23.6)).toBe(76)
    expect(remainingPercent(140)).toBe(0)
    expect(remainingPercent(-5)).toBe(100)
    expect(remainingPercent(Number.NaN)).toBe(0)
  })
})
