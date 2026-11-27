# Install P4 Bot

P4 Bot is an unofficial fork of T3 Code. It runs coding agents on your computer (or server) and lets you control them from the desktop app, web app, or mobile app. Install P4 Bot on the machine where your agents will run first.

## Requirements

You need at least one installed, authenticated coding agent (provider) before starting a thread. You can launch P4 Bot first and set up providers from the [Welcome page](./welcome-page.md) or **Settings → Providers**.

## Build from source

P4 Bot has no published installer, desktop build or mobile app yet. Run it from a checkout of [pnll1991/p4-bot](https://github.com/pnll1991/p4-bot) with `vp` (setup in the [development runbook](../operations/00_development.md#first-checkout)):

```bash
git clone https://github.com/pnll1991/p4-bot
cd p4-bot && vp i && vp run build:desktop
node apps/server/dist/bin.mjs
```

The server command is still called `t3`, and P4 Bot keeps its data in `~/.p4`, so it runs side by side with a T3 Code install.

| Task                          | Command                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| Start server and open web app | `t3` (or `t3 ./my-project`)                                             |
| Start server without browser  | `t3 serve`                                                              |
| Set up remote access          | `t3 up` ([Remote access](./remote-access.md))                           |
| Run in the background         | `t3 service install` ([Background service](./background-service.md))    |
| Reclaim database space        | `t3 doctor` ([Details](./background-service.md#reclaim-database-space)) |
| Uninstall                     | `t3 uninstall`                                                          |

If `t3` reports a server is already running, connect with `t3 pair` or pass a separate `--base-dir`. Run `t3 --help` for all commands.

> Don't run `t3 update` or the in-app server update: they download T3 Code releases, not P4 Bot. Update by pulling the checkout and rebuilding; see [Updating P4 Bot](./updating.md).

- **Desktop app**: Build it with `vp run dist:desktop:artifact` (see [Desktop artifacts](../operations/00_development.md#desktop-artifacts)). The desktop app bundles `t3` and sets it up on first launch (**Settings → About → t3 command**). Run `t3 app` (or `t3 app ../my-project`) to open a folder in the running desktop app.
- **Mobile app**: Build it from `apps/mobile` (see the [mobile README](../../apps/mobile/README.md)). It connects to a server on another machine via [remote access](./remote-access.md). If it crashes on launch, open **Settings → Diagnostics** on the next launch to copy recent startup crash reports.

### Windows Subsystem for Linux

Select a WSL distro in **Settings → Sharing & access** to run agents and projects inside WSL (install provider CLIs inside that distro). P4 Bot manages its own server runtime inside WSL automatically.

## Providers

Open **Settings → Providers** (web or desktop), select the environment, and enable the providers you use. Installation and sign-in always happen on the **environment's machine**.

| Provider         | Install and authenticate                                                                                                 | Guide                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| **Codex**        | Connect with ChatGPT in Settings, or install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`. | [Codex](./providers-codex.md)             |
| **Claude**       | Install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`.                               | [Claude](./providers-claude.md)           |
| **Cursor**       | Sign in in Settings or install [Cursor CLI](https://cursor.com/cli) and run `agent login`.                               | [Cursor](./cursor.md)                     |
| **Grok Build**   | Install [Grok Build CLI](https://x.ai/cli) and run `grok login`.                                                         | [Grok](./providers-grok.md)               |
| **Antigravity**  | Install managed runtime and sign in with Google in Settings.                                                             | [Antigravity](./providers-antigravity.md) |
| **OpenCode**     | Install [OpenCode](https://opencode.ai) and run `opencode auth login`.                                                   | [OpenCode](./providers-opencode.md)       |
| **Kiro**         | Install [Kiro CLI](https://kiro.dev/docs/cli/) and run `kiro-cli login`.                                                 | [Kiro](./providers-kiro.md)               |
| **Pi**           | Install [Pi](./providers-pi.md) (Node.js 22.19+) and run `pi` → `/login`.                                                | [Pi](./providers-pi.md)                   |
| **Muse Code**    | Install [Muse Code](https://dev.meta.ai/docs/muse-code) and run `muse login`.                                            | [Muse Code](./providers-muse.md)          |
| **fx**           | Install [fx](https://fx.sh) and run `fx login`.                                                                          | [fx](./providers-fx.md)                   |
| **ACP Registry** | Add GitHub Copilot and other agents in **Settings → Providers → Add provider → Show more**.                              | [ACP](./providers-acp.md)                 |

- **Binary path**: If a CLI isn't on the server's `PATH` (common with version managers), set **Binary path** in the provider's settings.
- **Updates**: Click **Update now** on outdated provider cards (supports Homebrew, mise `latest`, npm/pnpm/Yarn/Bun/Volta/Vite+, or the CLI's own updater; update Nix, Chocolatey, or pinned mise installs manually).
- **Multiple instances**: Add extra provider instances for separate accounts, API keys, or custom endpoints (mark secret env vars as sensitive).

### Provider check timeouts

If a working CLI times out during P4 Bot's readiness check, increase its probe deadline (in milliseconds) in the server's environment (or systemd override / `service.env`) and restart:

```bash
T3CODE_CODEX_PROBE_TIMEOUT_MS=60000 T3CODE_CLAUDE_PROBE_TIMEOUT_MS=60000 t3 serve
```

| Provider     | Environment variable                   |
| ------------ | -------------------------------------- |
| Codex        | `T3CODE_CODEX_PROBE_TIMEOUT_MS`        |
| Claude       | `T3CODE_CLAUDE_PROBE_TIMEOUT_MS`       |
| Cursor       | `T3CODE_CURSOR_PROBE_TIMEOUT_MS`       |
| Antigravity  | `T3CODE_ANTIGRAVITY_PROBE_TIMEOUT_MS`  |
| Grok         | `T3CODE_GROK_PROBE_TIMEOUT_MS`         |
| Kiro         | `T3CODE_KIRO_PROBE_TIMEOUT_MS`         |
| fx           | `T3CODE_FX_PROBE_TIMEOUT_MS`           |
| Pi           | `T3CODE_PI_PROBE_TIMEOUT_MS`           |
| Muse Code    | `T3CODE_MUSE_PROBE_TIMEOUT_MS`         |
| OpenCode     | `T3CODE_OPENCODE_PROBE_TIMEOUT_MS`     |
| ACP Registry | `T3CODE_ACP_REGISTRY_PROBE_TIMEOUT_MS` |

## Next steps

- [User guide index](./README.md): overview of how P4 Bot works.
- [Working with threads](./thread-sidebar.md): start tasks and organize parallel work.
- [Permission modes](./permission-modes.md): control when agents ask before acting.
- [Remote access](./remote-access.md): connect from another device.
- [Updating P4 Bot](./updating.md): keep apps, servers, and providers up to date.
