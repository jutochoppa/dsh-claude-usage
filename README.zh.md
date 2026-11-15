# dsh-claude-usage

[English](README.md) | 简体中文

一款精致的 Anthropic Claude 套餐用量指示器，适用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI。

该插件在侧栏底部添加一张整行宽度的用量卡片，布局与 dsh-codex-usage 卡片一致：Claude 标志和标题，然后每个额度一行，包含细进度条、剩余比例和重置时间。侧栏收起时卡片会切换为紧凑标签。

## 功能特性

- 侧栏卡片沿用 Codex 用量卡片的布局和 DSH 主题令牌，两个用量插件看起来风格统一。
- 完整展示 Claude 套餐限制的配额详情：5-hour 会话窗口、每周窗口、限定模型的每周限制、额外用量状态、套餐和速率限制层级。
- 默认每五分钟轮询一次，可通过 bundle row 配置。
- 鼠标悬停时获取新鲜数据，具备 250 ms 防抖、单个进行中的请求、共享的五分钟轮询缓存、更短的强制悬停缓存以及失败节流。
- 遵循 Anthropic 的 `Retry-After` 冷却时间；usage endpoint 本身会对激进轮询进行速率限制。
- 保留最后一次成功结果，因此临时的 provider 或网络故障不会清除有用数据。
- 只读凭据访问：插件绝不会写入或刷新 Claude Code 存储的登录信息。
- 通过 DSH 已认证的 connection 层提供的 API route（仅 owner Peers 可访问），以及一个会移除 token、identifier、email 和未知 provider field 的 allowlist normalizer。

## 要求

- Node.js 22 或更高版本
- pnpm 10
- DeepSeek Harness 0.2.2-rc.3 或之后的 0.2.x 版本（桌面应用或 `dsh web`）
- 已使用 Claude 订阅登录的较新版本 Claude Code CLI（`claude login`）；在 Claude Code 持有有效登录信息之前，指示器会显示指向 `claude login` 的错误状态
- Windows 或 Linux；Claude Code 在这些系统上将 OAuth credentials 存储于 `~/.claude/.credentials.json`（macOS 将 credentials 保存在 Keychain 中，目前尚不支持）

## 从此 checkout 安装

构建 package：

~~~sh
pnpm install
pnpm run check
~~~

从此目录将其添加到 DSH profile：

~~~sh
dsh plugin --profile desktop add .
dsh --profile desktop --dump-config
~~~

如需安装到 Web profile，请改用 `--profile web` 并通过 `dsh web` 启动。

开发期间，只有在运行 `pnpm run dev` 并重新构建插件输出时，Host 更改才会热重载。浏览器客户端更改需要重新构建，然后刷新现有 Web 页面。client bundle 由 DSH 的 client-module system 加载；既不需要也不应使用单独的 Vite server。

使用以下命令移除：

~~~sh
dsh plugin --profile desktop remove dsh-claude-usage
~~~

### 安装打包产物

tarball 随附预构建的 Host 和 lazy-CJS client artifacts，从而避免安装时的构建批准：

~~~sh
pnpm pack
dsh plugin --profile desktop add ./dsh-claude-usage-0.2.1.tgz
~~~

对于 Git-host 安装，pnpm 10 要求 profile 允许此 package 的 prepare script。请固定一个 commit，并严格遵循 DSH/pnpm 输出的 allowBuilds 指令。

## 配置

所有四个 field 均位于 **Settings → Plugins** 中的 **Claude usage** 标签页。更改会在本地暂存直至点击 Save，并通过 DSH Settings 持久化；每个 field 都是 volatile config field，保存后实时生效，无需重启。profile row 仍是已保存用户覆盖项之下的基础配置。

bundle 会插入以下 row：

~~~yaml
- id: claude-usage
  name: dsh-claude-usage
  config:
    refreshIntervalMs: 300000
    hoverRefreshMinAgeMs: 30000
    requestTimeoutMs: 15000
    credentialsFile: ''
~~~

在 profile 的 cordis.patch.yml 中覆盖整个 row，以更改 composition-layer base。后续 layer 会替换一个 row 的完整 config value；已保存的 Settings UI value 会覆盖该 base。

| 字段 | 默认值 | 含义 |
| --- | ---: | --- |
| refreshIntervalMs | 300000 | 后台轮询间隔；最短 60 seconds。 |
| hoverRefreshMinAgeMs | 30000 | 再次悬停刷新前的最短数据年龄；最短 5 seconds。 |
| requestTimeoutMs | 15000 | 每次 Anthropic usage request 的超时时间。 |
| credentialsFile | *(empty)* | Claude Code credentials file 的可选绝对路径；留空会选择各 OS 的默认位置。 |

## 工作原理

1. Host plugin 注入 DSH 的 `connection` service，并在其 Fetch registry 上注册精确的 GET route：/api/plugins/claude-usage。
2. 每次读取时，它都会在 credentials file 中只读查找 Claude Code OAuth access token。
3. 它会调用 Anthropic 的 OAuth usage endpoint——即 Claude Code 的 /usage command 背后同一个未公开的 beta API——并携带 `oauth-2025-04-20` beta header。
4. strict normalizer 将仅含配额的数据（percentages、ISO reset times、extra-usage flags）返回至已认证的 browser route。
5. browser 在 sidebar.footer.action 中注册一张整行宽度的卡片；同时安装两个插件时，它排在 Codex 用量卡片之后。
6. browser 按配置的 cadence 轮询，并在 250 ms hover debounce 后请求一次合并刷新。

过期 token 会在本地被检测到，并显示 "run claude login" 错误状态，而不是持续冲击 endpoint；Claude Code 会在正常使用过程中刷新自己的登录信息。429 response 会启用感知 Retry-After 的冷却机制，确保后台轮询绝不与 Anthropic 的 rate limiter 冲突。

client artifact 并非普通的 browser ESM。tsdown.config.ts 会生成 DSH 所需的 lazy-CJS registration。React 和 DSH UI packages 保持 external，并通过 DSH 的 client module table 解析，以防止重复的 React runtime。

## 安全与隐私

- 插件会读取 credentials file，但绝不会存储、传输、记录或刷新 token；access token 仅在一次请求期间存在于 Host process 内。
- 该 route 是 DSH 共享 /api channel 上的精确 GET route：DSH 的 connection 层会执行 Host/Origin 检查和浏览器认证，只有 owner Peers 能访问。
- response 会省略 token、account/workspace/user IDs、email、原始 provider payload 和未知 field；normalization 后仅保留经过范围约束的 percentages、reset timestamps、label 和 boolean flags。
- 错误消息为静态字符串，绝不会回显 credential path 或 provider response。
- 除可选的本地 credentials path 外，provider route 不可配置，从而避免成为任意 authenticated proxy。

## 开发

~~~sh
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run pack:check
~~~

默认 suite 会跳过 live provider test。请在已安装 Claude Code 并完成登录时运行：

~~~powershell
$env:CLAUDE_LIVE = '1'
pnpm exec vitest run tests/claude-live.spec.ts
~~~

## 参考资料

- [DSH：第一个插件](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/)
- [DSH：打包与安装](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)
- [DSH：添加设置卡片](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-settings-card)
- [DSH：客户端模块](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-modules)
- [ccusage](https://github.com/ccusage/ccusage) — Claude Code 的本地 transcript analytics
- OAuth usage contract 的社区确认：[LimitsChecker](https://github.com/lapurryt/LimitsChecker)、[claude-usage-widget](https://github.com/PanithanNanti/claude-usage-widget)

## 许可证

MIT
