import { expect, it } from 'vitest'
import { CredentialsUnavailableError, defaultCredentialsFile, readCredentials, type ClaudeCredentials } from '../src/credentials.js'
import { normalizeUsage } from '../src/normalize.js'
import { fetchOAuthUsage } from '../src/usage-api.js'

it.runIf(process.env.CLAUDE_LIVE === '1')('reads current plan usage through Anthropic OAuth usage endpoint', async ctx => {
  let credentials: ClaudeCredentials
  try {
    credentials = readCredentials(defaultCredentialsFile())
  } catch (error) {
    if (error instanceof CredentialsUnavailableError) {
      // Unsigned machines cannot exercise the provider; the unit suite covers the contract.
      ctx.skip()
      return
    }
    throw error
  }
  const result = await fetchOAuthUsage(credentials.accessToken, { requestTimeoutMs: 20_000 })
  if (result.kind === 'rate-limited') {
    // The usage endpoint throttles aggressive polling; a cooldown still proves auth worked.
    expect(result.retryAfterMs).toBeGreaterThan(0)
    return
  }
  expect(result.kind).toBe('success')
  if (result.kind !== 'success') return
  const usage = normalizeUsage(result.payload, {
    planType: credentials.planType,
    rateLimitTier: credentials.rateLimitTier,
  })
  expect(usage.source).toBe('claude-oauth-usage')
  expect(usage.session ?? usage.weekly ?? usage.weeklyScoped.length > 0).toBeTruthy()
}, 30_000)
