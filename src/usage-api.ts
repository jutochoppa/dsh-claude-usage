export type UsageApiResult =
  | { kind: 'success'; payload: unknown }
  | { kind: 'auth-expired' }
  | { kind: 'rate-limited'; retryAfterMs: number }
  | { kind: 'unavailable'; message: string }

export interface UsageApiOptions {
  requestTimeoutMs: number
  endpoint?: string
  betaHeader?: string
}

export const DEFAULT_USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage'
export const DEFAULT_BETA_HEADER = 'oauth-2025-04-20'

const DEFAULT_RETRY_AFTER_MS = 60_000
const MAX_RETRY_AFTER_MS = 15 * 60_000

export function retryAfterMs(headerValue: string | null | undefined): number {
  if (headerValue === null || headerValue === undefined) return DEFAULT_RETRY_AFTER_MS
  const seconds = Number.parseFloat(headerValue)
  const fromSeconds = Number.isFinite(seconds) ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS
  return Math.min(Math.max(fromSeconds, 1_000), MAX_RETRY_AFTER_MS)
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Call Anthropic's OAuth usage endpoint (the data source behind Claude Code's
 * /usage command). This is an undocumented beta API; every failure maps onto a
 * closed result union so callers never see raw provider payloads.
 */
export async function fetchOAuthUsage(accessToken: string, options: UsageApiOptions): Promise<UsageApiResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, options.requestTimeoutMs)
  try {
    const response = await fetch(options.endpoint ?? DEFAULT_USAGE_ENDPOINT, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'anthropic-beta': options.betaHeader ?? DEFAULT_BETA_HEADER,
      },
      signal: controller.signal,
      redirect: 'error',
    })
    if (response.status === 200) {
      try {
        return { kind: 'success', payload: await response.json() as unknown }
      } catch {
        return { kind: 'unavailable', message: 'Claude usage endpoint returned malformed JSON.' }
      }
    }
    if (response.status === 401) return { kind: 'auth-expired' }
    if (response.status === 429) return { kind: 'rate-limited', retryAfterMs: retryAfterMs(response.headers.get('retry-after')) }
    if (response.status >= 500) {
      return { kind: 'unavailable', message: `Claude usage endpoint returned HTTP ${String(response.status)}.` }
    }
    return { kind: 'unavailable', message: `Claude usage endpoint rejected the request with HTTP ${String(response.status)}.` }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { kind: 'unavailable', message: 'Claude usage endpoint request timed out.' }
    }
    return { kind: 'unavailable', message: `Claude usage endpoint could not be reached: ${message(error)}` }
  } finally {
    clearTimeout(timer)
  }
}
