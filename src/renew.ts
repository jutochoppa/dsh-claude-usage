import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Raised when Claude Code could not be found or did not renew its sign-in. */
export class RenewUnavailableError extends Error {}

/**
 * Where to look for the Claude Code CLI: `claude` on PATH first, then the
 * native installer's default location (`~/.local/bin`).
 */
export function claudeCommandCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const home = (platform === 'win32' ? env.USERPROFILE : env.HOME) ?? env.HOME ?? homedir()
  const local = join(home, '.local', 'bin', platform === 'win32' ? 'claude.exe' : 'claude')
  return ['claude', local]
}

function runAuthStatus(command: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // The output names the signed-in account, so it is discarded unread.
    execFile(command, ['auth', 'status'], { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, error => {
      if (error === null) resolve()
      else reject(error)
    })
  })
}

/**
 * Ask Claude Code to renew its own sign-in. `claude auth status` refreshes an
 * expired access token with Claude Code's stored refresh token and saves the
 * result to its credentials file. This plugin never reads or uses the refresh
 * token itself, so Claude Code stays the only writer of its sign-in.
 */
export async function renewViaClaudeCode(
  timeoutMs = 30_000,
  candidates: readonly string[] = claudeCommandCandidates(),
): Promise<void> {
  for (const command of candidates) {
    // Bare names resolve through PATH; absolute fallbacks must exist.
    if (command.includes('/') || command.includes('\\')) {
      if (!existsSync(command)) continue
    }
    try {
      await runAuthStatus(command, timeoutMs)
      return
    } catch {
      // Try the next location; a signed-out CLI exits non-zero everywhere.
    }
  }
  throw new RenewUnavailableError('Claude Code could not renew its sign-in.')
}
