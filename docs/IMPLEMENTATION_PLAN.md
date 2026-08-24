# Implementation plan

Research-backed design notes for dsh-claude-usage. Verified against Claude Code 2.1.235 and cross-checked across community consumers of the same endpoint.

## Data sources

| Source | Role |
| --- | --- |
| `GET https://api.anthropic.com/api/oauth/usage` with `anthropic-beta: oauth-2025-04-20` | Plan quota percentages; the same endpoint behind Claude Code's /usage command. |
| `%USERPROFILE%/.claude/.credentials.json` → `claudeAiOauth` | Read-only access-token lookup plus non-secret `subscriptionType`/`rateLimitTier` metadata. |

Observed response shape (allowlisted subset):

~~~json
{
  "limits": [
    { "kind": "session", "percent": 12, "resets_at": "2026-07-29T12:00:00Z", "severity": "normal" },
    { "kind": "weekly_all", "percent": 34, "resets_at": "2026-08-03T00:00:00Z" },
    {
      "kind": "weekly_scoped", "percent": 40, "is_active": true, "resets_at": "...",
      "scope": { "model": { "display_name": "Opus" }, "surface": "claude_code" }
    }
  ],
  "five_hour": { "utilization": 10, "resets_at": "..." },
  "seven_day": { "utilization": 30, "resets_at": "..." },
  "extra_usage": { "is_enabled": false, "utilization": 0 }
}
~~~

Behavioral constraints confirmed by existing consumers:

- The endpoint rate-limits aggressively; pollers must honor `Retry-After` on 429 and cache results for minutes, not seconds.
- 401 means the saved sign-in is dead until Claude Code (or a re-login) refreshes it.
- macOS stores Claude Code credentials in the Keychain, so the file lookup is Windows/Linux only for now.

## Decisions

1. **Read-only credentials.** Unlike community widgets that rotate and rewrite the OAuth blob, this plugin never refreshes or persists tokens. Expired tokens short-circuit before any network call and surface a "run claude login" error state; Claude Code refreshes its own sign-in during use.
2. **Allowlist normalization at the host boundary.** Only clamped percentages, epoch-millisecond reset times, model labels, tier names, and booleans cross to the browser. Tokens, IDs, emails, severity metadata, and future additive fields are dropped.
3. **Static error messages.** Failure codes are a closed union; messages never embed paths, payloads, or provider errors.
4. **Codex-parity UX.** Same 28 px ring geometry, footer placement math (`calc(100% - 34px)`, `--dcl-panel-available-width`), settings-card staging flow, and polling policy as dsh-codex-usage so both indicators feel native side by side.
5. **Ring value.** The ring mirrors the most-consumed of the 5-hour and weekly windows, matching how Claude Code's /usage surfaces the binding limit first.

## Test matrix

- Normalizer: clamping, legacy fallback shapes, scoped-model filtering, unknown-field stripping.
- Service: poll/hover caches, coalescing fence, failure throttling without leaking internals, credential-missing and expired-token short-circuits, auth mapping, Retry-After cooldown spanning a poll boundary.
- Route security: loopback/Origin/Fetch-Metadata gate.
- Client: store coalescing and last-good fallback, hover-gap panel behavior, footer rebinding, staged four-field settings card with revision-drift protection.
- Bundle: lazy-CJS registration under the plugin id, plus negative assertions keeping provider endpoints and credential material out of the browser artifact.
- Live (opt-in via `CLAUDE_LIVE=1`): real credentials + real endpoint, tolerant of a legitimate 429 cooldown.
