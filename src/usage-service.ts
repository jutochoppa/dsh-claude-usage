import {
  CredentialsUnavailableError,
  readCredentials,
  resolveCredentialsFile,
  type ClaudeCredentials,
} from './credentials.js'
import { normalizeUsage } from './normalize.js'
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
}

const RATE_LIMIT_FLOOR_MS = 60_000

type ErrorCode =
  | 'CLAUDE_CREDENTIALS_UNAVAILABLE'
  | 'CLAUDE_TOKEN_EXPIRED'
  | 'CLAUDE_AUTH_REQUIRED'
  | 'CLAUDE_USAGE_RATE_LIMITED'
  | 'CLAUDE_USAGE_UNAVAILABLE'

// Static, allowlisted messages only: never echo credential paths or payloads.
const ERROR_MESSAGES: Record<ErrorCode, string> = {
  CLAUDE_CREDENTIALS_UNAVAILABLE: 'Unable to read Claude Code credentials. Confirm that Claude Code is installed and signed in.',
  CLAUDE_TOKEN_EXPIRED: 'The Claude Code sign-in has expired. Run claude login to sign in again.',
  CLAUDE_AUTH_REQUIRED: 'Claude rejected the saved sign-in. Run claude login to sign in again.',
  CLAUDE_USAGE_RATE_LIMITED: 'Claude is limiting usage requests. The plugin will retry after the cooldown.',
  CLAUDE_USAGE_UNAVAILABLE: 'Unable to read Claude plan usage right now.',
}

export class UsageService {
  private lastGood: ClaudeUsageData | null = null
  private lastResult: ClaudeUsageResponse | null = null
  private lastAttemptAt = 0
  private inFlight: Promise<ClaudeUsageResponse> | null = null
  private rateLimitedUntil = 0
  private readonly loadCredentials: () => Promise<ClaudeCredentials>
  private readonly fetchUsage: (accessToken: string) => Promise<UsageApiResult>

  constructor(
    private readonly options: UsageServiceOptions,
    deps: UsageServiceDeps = {},
  ) {
    const file = resolveCredentialsFile(options.credentialsFile)
    this.loadCredentials = deps.readCredentials ?? (async () => readCredentials(file))
    this.fetchUsage = deps.fetchUsage ?? (async accessToken => fetchOAuthUsage(accessToken, {
      requestTimeoutMs: options.requestTimeoutMs,
    }))
  }

  get policy(): UsagePolicy {
    return {
      refreshIntervalMs: this.options.refreshIntervalMs,
      hoverRefreshMinAgeMs: this.options.hoverRefreshMinAgeMs,
    }
  }

  async read(force = false): Promise<ClaudeUsageResponse> {
    const age = Date.now() - this.lastAttemptAt
    const minimumAge = force ? this.options.hoverRefreshMinAgeMs : this.options.refreshIntervalMs
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
      const credentials = await this.loadCredentials()
      if (credentials.expiresAtMs !== null && credentials.expiresAtMs <= Date.now()) {
        result = this.failure('CLAUDE_TOKEN_EXPIRED')
        this.lastResult = result
        return result
      }
      const api = await this.fetchUsage(credentials.accessToken)
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
