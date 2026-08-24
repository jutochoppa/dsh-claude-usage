# dsh-claude-usage

A polished Anthropic Claude plan-usage indicator for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI.

The plugin preserves the standard Settings gear and label while adding a context-meter-style ring at the far right. The ring contains the Anthropic mark and opens a detailed quota panel on hover or keyboard focus.

## Features

- Native-looking usage ring using the same 28 px geometry and DSH design tokens as the conversation context meter.
- Full quota detail for Claude plan limits: the 5-hour session window, the weekly window, model-scoped weekly limits, extra-usage state, plan and rate-limit tier.
- Five-minute polling by default, configurable through the bundle row.
- Fresh-on-hover data with a 250 ms debounce, one in-flight request, a shared five-minute poll cache, a shorter forced-hover cache, and failure throttling.
- Honors Anthropic's `Retry-After` cooldowns; the usage endpoint itself rate-limits aggressive polling.
- Last-good fallback so a temporary provider or network failure does not erase useful data.
- Read-only credential access: the plugin never writes to or refreshes Claude Code's stored sign-in.
- Loopback-only API route and an allowlist normalizer that removes tokens, identifiers, emails, and unknown provider fields.

## Requirements

- Node.js 20 or newer
- pnpm 10
- DeepSeek Harness 0.1.1-rc.2 or compatible
- A recent Claude Code CLI signed in with a Claude subscription (`claude login`); until Claude Code holds a valid sign-in, the indicator shows an error state pointing at `claude login`
- Windows or Linux, where Claude Code stores its OAuth credentials at `~/.claude/.credentials.json` (macOS keeps credentials in the Keychain and is not supported yet)

## Install from this checkout

Build the package:

~~~sh
pnpm install
pnpm run check
~~~

Add it to a DSH profile from this directory:

~~~sh
dsh plugin --profile web add .
dsh --profile web --dump-config
dsh web
~~~

Refresh the existing Web page after the DSH host restarts. The client bundle is loaded by DSH's client-module system; a separate Vite server is neither required nor useful.

Remove it with:

~~~sh
dsh plugin --profile web remove dsh-claude-usage
~~~

### Install a packed artifact

A tarball ships prebuilt Host and lazy-CJS client artifacts, avoiding install-time build approval:

~~~sh
pnpm pack
dsh plugin --profile web add ./dsh-claude-usage-0.1.0.tgz
~~~

For a Git-host install, pnpm 10 requires the profile to allow this package's prepare script. Pin a commit and follow the exact allowBuilds instruction printed by DSH/pnpm.

## Configuration

All four fields are available in **Settings → Plugins → Claude usage**. Changes are staged locally until Save, are persisted through DSH Settings, and take effect after DSH Web restarts. The profile row remains the base configuration beneath saved user overrides.

The bundle inserts this row:

~~~yaml
- id: claude-usage
  name: dsh-claude-usage
  config:
    refreshIntervalMs: 300000
    hoverRefreshMinAgeMs: 30000
    requestTimeoutMs: 15000
    credentialsFile: ''
~~~

Override the whole row in the profile's cordis.patch.yml to change the composition-layer base. Later layers replace a row's complete config value; saved Settings UI values override that base.

| Field | Default | Meaning |
| --- | ---: | --- |
| refreshIntervalMs | 300000 | Background poll interval; minimum 60 seconds. |
| hoverRefreshMinAgeMs | 30000 | Minimum age before another hover refresh; minimum 5 seconds. |
| requestTimeoutMs | 15000 | Timeout for each Anthropic usage request. |
| credentialsFile | *(empty)* | Optional absolute path to the Claude Code credentials file; empty selects the default per-OS location. |

## How it works

1. The Host plugin injects DSH's webServer service and registers GET /api/plugins/claude-usage.
2. On each read it performs a read-only lookup of the Claude Code OAuth access token in the credentials file.
3. It calls Anthropic's OAuth usage endpoint — the same undocumented beta API behind Claude Code's /usage command — with the `oauth-2025-04-20` beta header.
4. A strict normalizer returns quota-only data (percentages, ISO reset times, extra-usage flags) to the loopback browser route.
5. The browser registers an independent action in sidebar.footer.action, reserves space at the right edge of the Settings row, and leaves the built-in Settings button and its behavior untouched.
6. The browser polls on the configured cadence and requests a coalesced refresh after a 250 ms hover debounce.

Expired tokens are detected locally and surface a "run claude login" error state instead of hammering the endpoint; Claude Code refreshes its own sign-in during normal use. A 429 response arms a Retry-After-aware cooldown so background polls never fight Anthropic's rate limiter.

The client artifact is not ordinary browser ESM. tsdown.config.ts emits DSH's required lazy-CJS registration. React and DSH UI packages remain external and resolve through DSH's client module table, preventing duplicate React runtimes.

## Security and privacy

- The plugin reads the credentials file but never stores, transmits, logs, or refreshes the token; the access token exists only inside the Host process for the duration of one request.
- The Web route accepts only GET from loopback clients and rejects cross-site Origin, Referer, and Fetch Metadata signals.
- Responses omit tokens, account/workspace/user IDs, emails, raw provider payloads, and unknown fields; only clamped percentages, reset timestamps, labels, and boolean flags survive normalization.
- Error messages are static strings that never echo credential paths or provider responses.
- The provider route is not configurable beyond the optional local credentials path, avoiding an arbitrary authenticated proxy.

## Development

~~~sh
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run pack:check
~~~

The default suite skips the live provider test. Run it when Claude Code is installed and signed in:

~~~powershell
$env:CLAUDE_LIVE = '1'
pnpm exec vitest run tests/claude-live.spec.ts
~~~

## References

- [DSH: Your first plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/)
- [DSH: Package and install](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)
- [DSH: Adding a settings card](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-settings-card)
- [DSH: Client modules](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-modules)
- [ccusage](https://github.com/ccusage/ccusage) — local transcript analytics for Claude Code
- Community confirmations of the OAuth usage contract: [LimitsChecker](https://github.com/lapurryt/LimitsChecker), [claude-usage-widget](https://github.com/PanithanNanti/claude-usage-widget)

## License

MIT
