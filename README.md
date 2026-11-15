# dsh-claude-usage

English | [简体中文](README.zh.md)

A polished Anthropic Claude plan-usage indicator for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI.

The plugin adds a full-width usage card to the sidebar footer, laid out like the dsh-codex-usage card: the Claude mark and title, then one row per limit with a thin progress bar, the remaining share, and the reset time. In the collapsed sidebar rail the card switches to compact labels.

## Features

- Sidebar card that matches the Codex usage card's layout and DSH theme tokens, so both providers read as one set.
- Full quota detail for Claude plan limits: the 5-hour session window, the weekly window, model-scoped weekly limits, extra-usage state, plan and rate-limit tier.
- Five-minute polling by default, configurable through the bundle row.
- Fresh-on-hover data with a 250 ms debounce, one in-flight request, a shared five-minute poll cache, a shorter forced-hover cache, and failure throttling.
- Honors Anthropic's `Retry-After` cooldowns; the usage endpoint itself rate-limits aggressive polling.
- Last-good fallback so a temporary provider or network failure does not erase useful data.
- Read-only credential access: the plugin never writes to or refreshes Claude Code's stored sign-in.
- API route served through DSH's authenticated connection layer (owner Peers only) and an allowlist normalizer that removes tokens, identifiers, emails, and unknown provider fields.

## Requirements

- Node.js 22 or newer
- pnpm 10
- DeepSeek Harness 0.2.2-rc.3 or a later 0.2.x release (desktop app or `dsh web`)
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
dsh plugin --profile desktop add .
dsh --profile desktop --dump-config
~~~

Use `--profile web` (and boot with `dsh web`) to target the Web profile instead of the desktop app.

During development, Host changes hot-reload only while `pnpm run dev` is running and rebuilding the plugin output. Browser client changes require a rebuild and then a refresh of the existing Web page. The client bundle is loaded by DSH's client-module system; a separate Vite server is neither required nor useful.

Remove it with:

~~~sh
dsh plugin --profile desktop remove dsh-claude-usage
~~~

### Install a packed artifact

A tarball ships prebuilt Host and lazy-CJS client artifacts, avoiding install-time build approval:

~~~sh
pnpm pack
dsh plugin --profile desktop add ./dsh-claude-usage-0.2.1.tgz
~~~

For a Git-host install, pnpm 10 requires the profile to allow this package's prepare script. Pin a commit and follow the exact allowBuilds instruction printed by DSH/pnpm.

## Configuration

All four fields are available in the **Claude usage** tab of **Settings → Plugins**. Changes are staged locally until Save and persisted through DSH Settings. Every field is a volatile config field, so saved values apply live without a restart. The profile row remains the base configuration beneath saved user overrides.

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

1. The Host plugin injects DSH's `connection` service and registers an exact GET route, /api/plugins/claude-usage, on its Fetch registry.
2. On each read it performs a read-only lookup of the Claude Code OAuth access token in the credentials file.
3. It calls Anthropic's OAuth usage endpoint — the same undocumented beta API behind Claude Code's /usage command — with the `oauth-2025-04-20` beta header.
4. A strict normalizer returns quota-only data (percentages, ISO reset times, extra-usage flags) to the authenticated browser route.
5. The browser registers a full-width card in sidebar.footer.action, ordered directly after the Codex usage card when both are installed.
6. The browser polls on the configured cadence and requests a coalesced refresh after a 250 ms hover debounce.

Expired tokens are detected locally and surface a "run claude login" error state instead of hammering the endpoint; Claude Code refreshes its own sign-in during normal use. A 429 response arms a Retry-After-aware cooldown so background polls never fight Anthropic's rate limiter.

The client artifact is not ordinary browser ESM. tsdown.config.ts emits DSH's required lazy-CJS registration. React and DSH UI packages remain external and resolve through DSH's client module table, preventing duplicate React runtimes.

## Security and privacy

- The plugin reads the credentials file but never stores, transmits, logs, or refreshes the token; the access token exists only inside the Host process for the duration of one request.
- The route is an exact GET route on DSH's shared /api channel: DSH's connection layer applies its Host/Origin checks and browser authentication, and only owner Peers reach it.
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
