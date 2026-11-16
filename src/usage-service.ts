import {
  CredentialsUnavailableError,
  readCredentials,
  resolveCredentialsFile,
  type ClaudeCredentials,
} from './credentials.js'
import { normalizeUsage } from './normalize.js'
import { renewViaClaudeCode } from './renew.js'
import { fetchOAuthUsage, type UsageApiResult } from './usage-api.js'
import type { ClaudeUsageData, ClaudeUsageResponse, UsagePolicy } from './types.js'

export interface UsageServiceOptions extends UsagePolicy {
  requestTimeoutMs: number
  credentialsFile: string
}

export interface UsageServiceDeps {
  /** Supplies current credentials; defaults to a read-only credentials-file lookup. */
  readCredentials?: () => Promise<ClaudeCredentials>
  /** Performs the provider call; defaults to {@link fetchOAuthUsage}. */
  fetchUsage?: (accessToken: string) => Promise<UsageApiResult>
  /** Asks Claude Code to renew its sign-in; defaults to {@link renewViaClaudeCode}. */
  renewCredentials?: () => Promise<void>
}

const RATE_LIMIT_FLOOR_MS = 60_000
/** Renew a little before expiry so a request never races the deadline. */
export const RENEW_MARGIN_MS = 60_000
/** At most one renewal attempt per window, so hovering never spawns the CLI repeatedly. */
export const RENEW_COOLDOWN_MS = 5 * 60_000

function expiresSoon(credentials: ClaudeCredentials, now: number): boolean {
  return credentials.expiresAtMs !== null && credentials.expiresAtMs <= now + RENEW_MARGIN_MS
}

type ErrorCode =
  | 'CLAUDE_CREDENTIALS_UNAVAILABLE'
  | 'CLAUDE_TOKEN_EXPIRED'
  | 'CLAUDE_AUTH_REQUIRED'
  | 'CLAUDE_USAGE_RATE_LIMITED'
  | 'CLAUDE_USAGE_UNAVAILABLE'

// Static, allowlisted messages only: never echo credential paths or payloads.
const ERROR_MESSAGES: Record<ErrorCode, string> = {
  CLAUDE_CREDENTIALS_UNAVAILABLE: 'Unable to read Claude Code credentials. Confirm that Claude Code is installed and signed in.',
  CLAUDE_TOKEN_EXPIRED: 'The Claude Code sign-in expired and could not be renewed automatically. Run claude auth status, or /login in Claude Code.',
  CLAUDE_AUTH_REQUIRED: 'Claude rejected the saved sign-in. Run /login in Claude Code to sign in again.',
  CLAUDE_USAGE_RATE_LIMITED: 'Claude is limiting usage requests. The plugin will retry after the cooldown.',
  CLAUDE_USAGE_UNAVAILABLE: 'Unable to read Claude plan usage right now.',
}

export class UsageService {
  private lastGood: ClaudeUsageData | null = null
  private lastResult: ClaudeUsageResponse | null = null
  private lastAttemptAt = 0
  private inFlight: Promise<ClaudeUsageResponse> | null = null
  private rateLimitedUntil = 0
  private lastRenewAt = Number.NEGATIVE_INFINITY
  private readonly loadCredentials: () => Promise<ClaudeCredentials>
  private readonly fetchUsage: (accessToken: string) => Promise<UsageApiResult>
  private readonly renewCredentials: () => Promise<void>
  private readonly currentOptions: () => UsageServiceOptions

  /**
   * @param options - fixed options, or a getter read on every call so live
   * (volatile) settings edits apply without recreating the service.
   */
  constructor(
    options: UsageServiceOptions | (() => UsageServiceOptions),
    deps: UsageServiceDeps = {},
  ) {
    this.currentOptions = typeof options === 'function' ? options : () => options
    this.loadCredentials = deps.readCredentials
      ?? (async () => readCredentials(resolveCredentialsFile(this.options.credentialsFile)))
    this.fetchUsage = deps.fetchUsage ?? (async accessToken => fetchOAuthUsage(accessToken, {
      requestTimeoutMs: this.options.requestTimeoutMs,
    }))
    this.renewCredentials = deps.renewCredentials ?? (async () => renewViaClaudeCode())
  }

  /**
   * Let Claude Code renew its sign-in, then re-read the credentials file.
   * Returns null when renewal is cooling down, fails, or the file is unreadable.
   */
  private async renew(): Promise<ClaudeCredentials | null> {
    const now = Date.now()
    if (now - this.lastRenewAt < RENEW_COOLDOWN_MS) return null
    this.lastRenewAt = now
    try {
      await this.renewCredentials()
      return await this.loadCredentials()
    } catch {
      return null
    }
  }

  private get options(): UsageServiceOptions {
    return this.currentOptions()
  }

  get policy(): UsagePolicy {
    const options = this.options
    return {
      refreshIntervalMs: options.refreshIntervalMs,
      hoverRefreshMinAgeMs: options.hoverRefreshMinAgeMs,
    }
  }

  async read(force = false): Promise<ClaudeUsageResponse> {
    const age = Date.now() - this.lastAttemptAt
    const options = this.options
    const minimumAge = force ? options.hoverRefreshMinAgeMs : options.refreshIntervalMs
    if (this.lastResult !== null && age < minimumAge) return this.lastResult
    if (this.inFlight !== null) return this.inFlight
    this.inFlight = this.fetch()
    try {
      return await this.inFlight
    } finally {
      this.inFlight = null
    }
  }

  dispose(): void {
    this.lastGood = null
    this.lastResult = null
    this.rateLimitedUntil = 0
  }

  private failure(code: ErrorCode): ClaudeUsageResponse {
    return {
      ok: false,
      error: { code, message: ERROR_MESSAGES[code] },
      stale: this.lastGood,
      policy: this.policy,
    }
  }

  private async fetch(): Promise<ClaudeUsageResponse> {
    this.lastAttemptAt = Date.now()
    let result: ClaudeUsageResponse
    if (Date.now() < this.rateLimitedUntil) {
      result = this.failure('CLAUDE_USAGE_RATE_LIMITED')
      this.lastResult = result
      return result
    }
    try {
      let credentials = await this.loadCredentials()
      if (expiresSoon(credentials, Date.now())) {
        const renewed = await this.renew()
        if (renewed !== null) credentials = renewed
        if (credentials.expiresAtMs !== null && credentials.expiresAtMs <= Date.now()) {
          result = this.failure('CLAUDE_TOKEN_EXPIRED')
          this.lastResult = result
          return result
        }
      }
      let api = await this.fetchUsage(credentials.accessToken)
      if (api.kind === 'auth-expired') {
        // The token was revoked or refreshed elsewhere: renew once and retry
        // only if Claude Code actually produced a different token.
        const renewed = await this.renew()
        if (renewed !== null && renewed.accessToken !== credentials.accessToken) {
          credentials = renewed
          api = await this.fetchUsage(credentials.accessToken)
        }
      }
      switch (api.kind) {
        case 'success': {
          this.lastGood = normalizeUsage(api.payload, {
            planType: credentials.planType,
            rateLimitTier: credentials.rateLimitTier,
          })
          result = { ok: true, data: this.lastGood, policy: this.policy }
          break
        }
        case 'auth-expired':
          result = this.failure('CLAUDE_AUTH_REQUIRED')
          break
        case 'rate-limited': {
          this.rateLimitedUntil = Date.now() + Math.max(api.retryAfterMs, RATE_LIMIT_FLOOR_MS)
          result = this.failure('CLAUDE_USAGE_RATE_LIMITED')
          break
        }
        case 'unavailable':
          result = this.failure('CLAUDE_USAGE_UNAVAILABLE')
          break
      }
    } catch (error) {
      result = this.failure(error instanceof CredentialsUnavailableError
        ? 'CLAUDE_CREDENTIALS_UNAVAILABLE'
        : 'CLAUDE_USAGE_UNAVAILABLE')
    }
    this.lastResult = result
    return result
  }
}
