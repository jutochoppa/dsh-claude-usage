import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('built client artifact', () => {
  it('registers the required DSH lazy-CJS factory', () => {
    let registration: { id: string; factory: unknown } | undefined
    const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
    runInNewContext(source, {
      window: {
        __ModuleLoader__: {
          load(value: { id: string; factory: unknown }) { registration = value },
        },
      },
    })
    expect(registration?.id).toBe('dsh-claude-usage')
    expect(registration?.factory).toBeTypeOf('function')
    expect(source).toContain('sidebar.footer.action')
    expect(source).toContain('settings.plugin.item')
    expect(source).toContain('claude-usage')
    expect(source).toContain('calc(100vw - 24px)')
    expect(source).toContain('m4.7144 15.9555')
    expect(source).not.toContain('M17.3041 3.541')
    expect(source).not.toContain('settings.trigger')
  })

  it('keeps provider endpoints and credential material out of the browser bundle', () => {
    const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
    expect(source).not.toContain('api.anthropic.com')
    expect(source).not.toContain('accessToken')
    expect(source).not.toContain('.credentials.json')
  })
})
