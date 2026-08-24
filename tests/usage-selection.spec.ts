import { describe, expect, it } from 'vitest'
import { mainPlanUsedPercent } from '../src/client/index.js'
import { normalizeUsage } from '../src/normalize.js'

describe('Claude usage selection', () => {
  it('drives the circular meter from the most-consumed plan window', () => {
    const data = normalizeUsage({
      limits: [
        { kind: 'session', percent: 31, resets_at: '2026-07-29T12:00:00Z' },
        { kind: 'weekly_all', percent: 47, resets_at: '2026-08-03T00:00:00Z' },
        { kind: 'weekly_scoped', percent: 94, is_active: true, scope: { model: { display_name: 'Opus' } } },
      ],
    }, { planType: 'max', rateLimitTier: null })

    expect(mainPlanUsedPercent(data)).toBe(47)
    expect(data.weeklyScoped.map(entry => entry.modelLabel)).toEqual(['Opus'])
  })

  it('falls back to zero while no windows are reported yet', () => {
    const data = normalizeUsage({}, { planType: null, rateLimitTier: null })
    expect(mainPlanUsedPercent(data)).toBe(0)
    expect(data.session).toBeNull()
    expect(data.weekly).toBeNull()
  })
})
