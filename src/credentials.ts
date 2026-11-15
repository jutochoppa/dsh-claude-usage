import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'

/** Allowlisted, non-secret view of Claude Code's stored OAuth credentials. */
export interface ClaudeCredentials {
  accessToken: string
  expiresAtMs: number | null
  planType: string | null
  rateLimitTier: string | null
}

/** Raised when credentials cannot be located or parsed. Messages stay free of file contents. */
export class CredentialsUnavailableError extends Error {}

export function defaultCredentialsFile(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.USERPROFILE ?? env.HOME ?? homedir()
  if (home === '') return ''
  return resolve(home, '.claude', '.credentials.json')
}

export function resolveCredentialsFile(configured: string): string {
  const trimmed = configured.trim()
  if (trimmed !== '') return isAbsolute(trimmed) ? trimmed : resolve(trimmed)
  return defaultCredentialsFile()
}

function parseExpiry(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // A zero or negative timestamp is a placeholder, not an expiry in 1970.
    if (value <= 0) return null
    // Claude Code writes epoch milliseconds; accept epoch seconds defensively.
    return value >= 1e11 ? value : value * 1000
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * Read-only lookup of the Claude Code OAuth access token.
 * The token itself never appears in errors or logs; callers only receive the
 * allowlisted {@link ClaudeCredentials} projection.
 */
export function readCredentials(file: string): ClaudeCredentials {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    throw new CredentialsUnavailableError('Claude Code credentials were not found on this machine.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new CredentialsUnavailableError('Claude Code credentials could not be parsed.')
  }
  const root = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
  const oauth = typeof root.claudeAiOauth === 'object' && root.claudeAiOauth !== null && !Array.isArray(root.claudeAiOauth)
    ? root.claudeAiOauth as Record<string, unknown>
    : root
  const accessToken = typeof oauth.accessToken === 'string' ? oauth.accessToken.trim() : ''
  if (accessToken === '') {
    throw new CredentialsUnavailableError('Claude Code credentials do not contain an OAuth access token.')
  }
  return {
    accessToken,
    expiresAtMs: parseExpiry(oauth.expiresAt),
    planType: optionalText(oauth.subscriptionType),
    rateLimitTier: optionalText(oauth.rateLimitTier),
  }
}
