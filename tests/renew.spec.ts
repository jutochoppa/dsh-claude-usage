import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { claudeCommandCandidates, renewViaClaudeCode, RenewUnavailableError } from '../src/renew.js'

describe('Claude Code sign-in renewal', () => {
  it('looks on PATH first, then in the native installer location', () => {
    expect(claudeCommandCandidates({ USERPROFILE: 'C:\\Users\\someone' }, 'win32'))
      .toEqual(['claude', join('C:\\Users\\someone', '.local', 'bin', 'claude.exe')])
    expect(claudeCommandCandidates({ HOME: '/home/someone' }, 'linux'))
      .toEqual(['claude', join('/home/someone', '.local', 'bin', 'claude')])
  })

  it('fails cleanly when no Claude Code CLI can be run', async () => {
    await expect(renewViaClaudeCode(5_000, [
      'definitely-not-a-claude-cli-0f3a9c',
      join(process.cwd(), 'missing', 'claude-cli-that-does-not-exist'),
    ])).rejects.toBeInstanceOf(RenewUnavailableError)
  })
})
