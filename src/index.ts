import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-settings'
import { UsageService, type UsageServiceOptions } from './usage-service.js'

export const name = 'dsh-claude-usage'
/** Profile entry id from cordis.patch.yml; DSH 0.2 settings forms are keyed by it. */
export const SETTINGS_NAMESPACE = 'claude-usage'
export const inject = ['connection'] as const

/** Plain settings snapshot read from the live (volatile) config references. */
export interface Settings {
  refreshIntervalMs: number
  hoverRefreshMinAgeMs: number
  requestTimeoutMs: number
  credentialsFile: string
}

/** Every field is volatile: Settings edits apply live without remounting the plugin. */
export interface Config {
  refreshIntervalMs: Volatile<number>
  hoverRefreshMinAgeMs: Volatile<number>
  requestTimeoutMs: Volatile<number>
  credentialsFile: Volatile<string>
}

export const Config = Schema.object({
  refreshIntervalMs: Schema.natural().min(60_000).default(300_000)
    .description('Milliseconds between background usage polls.').volatile(),
  hoverRefreshMinAgeMs: Schema.natural().min(5_000).default(30_000)
    .description('Milliseconds before another hover refresh may run.').volatile(),
  requestTimeoutMs: Schema.natural().min(1_000).default(15_000)
    .description('Milliseconds allowed for each Anthropic usage request.').volatile(),
  credentialsFile: Schema.string().default('')
    .description('Optional path to the Claude Code credentials file. Empty uses the default location.').volatile(),
})

export function assertConfig(config: Settings): void {
  if (!Number.isSafeInteger(config.refreshIntervalMs) || config.refreshIntervalMs < 60_000) {
    throw new Error('dsh-claude-usage: refreshIntervalMs must be an integer of at least 60000')
  }
  if (!Number.isSafeInteger(config.hoverRefreshMinAgeMs) || config.hoverRefreshMinAgeMs < 5_000) {
    throw new Error('dsh-claude-usage: hoverRefreshMinAgeMs must be an integer of at least 5000')
  }
  if (!Number.isSafeInteger(config.requestTimeoutMs) || config.requestTimeoutMs < 1_000) {
    throw new Error('dsh-claude-usage: requestTimeoutMs must be an integer of at least 1000')
  }
  if (typeof config.credentialsFile !== 'string') {
    throw new Error('dsh-claude-usage: credentialsFile must be a path or an empty string')
  }
}

/** Snapshot the live config references; each call sees the latest saved values. */
export function readSettings(config: Config): Settings {
  return {
    refreshIntervalMs: config.refreshIntervalMs.get(),
    hoverRefreshMinAgeMs: config.hoverRefreshMinAgeMs.get(),
    requestTimeoutMs: config.requestTimeoutMs.get(),
    credentialsFile: config.credentialsFile.get(),
  }
}

export const ROUTE = '/api/plugins/claude-usage'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

export function apply(ctx: Context, config: Config): void {
  assertConfig(readSettings(config))
  const options = (): UsageServiceOptions => readSettings(config)
  const usage = new UsageService(options)
  ctx.effect(() => () => { usage.dispose() }, 'claude-usage: service state')

  // This plugin renders its own Settings tab, so suppress the generated page.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'claude-usage: settings presentation')
  })

  // DSH 0.2 owns /api through the authenticated connection layer: only owner
  // Peers reach an exact route, after the carrier's Host/Origin checks.
  ctx.effect(() => {
    const unregister = ctx.connection.fetch.register({
      path: ROUTE,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request: Request): Promise<Response> {
        const force = new URL(request.url).searchParams.get('refresh') === '1'
        const result = await usage.read(force)
        return json(result.ok ? 200 : 503, result)
      },
    })
    return async () => { await unregister() }
  }, 'claude-usage: API route')
}

export type {
  AccountSnapshot,
  ClaudeUsageData,
  ClaudeUsageResponse,
  ExtraUsageSnapshot,
  ScopedModelWindow,
  UsagePolicy,
  UsageWindow,
} from './types.js'
