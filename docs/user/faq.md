# FAQ

## Is P4 Bot a harness?

No. A harness turns an LLM into an agent (tools, execution loop, and results)—like Claude Code's Agent SDK or Codex App Server. P4 Bot drives those harnesses through one fast interface; it does not work without at least one installed agent.

Bring your own: Claude Code, Codex, Cursor, Grok Build, OpenCode, Google Antigravity, Kiro, Pi, Muse Code, fx, or any [ACP agent](./providers-acp.md). See [Provider setup](./install.md#providers). (Longer read: [What is a harness?](https://t3.gg/blog/post/what-is-a-harness))

## Why use P4 Bot instead of Claude Code or the Codex app?

- **Bring your own subscription**: Use Claude, Codex, and every other agent you already have installed in one place.
- **Remote-first**: Run `t3 up` on any box and drive it from anywhere.
- **Mobile app**: Approve steps, review PRs, and steer threads from iOS and Android (build it from source for now).
- **Open source (MIT)**: Fork the source code under your own branding if you ever want something different.

## Can I use P4 Bot with my Claude Code subscription?

Yes.

## How much does P4 Bot cost?

Nothing. You pay your own model/agent providers.

## Can I fork or redistribute P4 Bot?

Yes, under the [MIT License](../../LICENSE). P4 Bot is itself an unofficial fork of the T3 Code source code and is not affiliated with T3 Tools, Inc. The license does not cover T3 Tools' trademarks: a fork must not use the T3 Code name, logos or branding. See [TRADEMARK.md](../../TRADEMARK.md).

## Why is my Claude 5-hour limit draining so fast?

Since v0.1.7, Claude in P4 Bot drains your 5-hour limit at the same rate as Claude Code directly (an earlier Anthropic Agent SDK discrepancy has been resolved). If you still see it, [update P4 Bot](./updating.md) on the machine running your agents.

## How do I use P4 Bot remotely?

Your agents run wherever the P4 Bot server runs (desktop, server, or VPS). Run `t3 up --lan` on that machine and connect over your LAN, Tailscale or SSH. See [Remote access](./remote-access.md).

## How do I use P4 Bot on my phone?

There is no published P4 Bot mobile app yet; build it from `apps/mobile` and connect it to your computer with a pairing link. The phone is a remote control—your host computer runs the agents and must stay on. See [Mobile app](./install.md#mobile-app) and [Remote access](./remote-access.md).

## Will I get banned for using my subscription?

No. P4 Bot stays within the TOS of Claude Code, Codex, Google Antigravity, Grok Build, Cursor, and official ACP bindings.

## Can I add a bunch of accounts for one provider?

P4 Bot intentionally does not include an automatic multi-account switcher to avoid risking provider TOS bans. Adding a separate work/personal account is supported ([Codex](./providers-codex.md#use-multiple-accounts), [Claude](./providers-claude.md#multiple-accounts-and-presets)). For larger pools managed externally (e.g. via [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)), P4 Bot can display pooled limits under Usage ([Connect a hub](./usage.md#connect-a-cliproxyapi-hub)).

## Can I use an API key or OpenRouter instead of a subscription?

Yes. Add another provider instance in **Settings → Providers** with its own environment variables and endpoint (your subscription setup stays untouched). See [OpenRouter for Claude](./providers-claude.md#openrouter-and-local-routers) and [Providers](./install.md#providers).

## Does P4 Bot support local models?

No. P4 Bot focuses on frontier coding agents.

## Does my code go to anyone else's servers?

No. Code and prompts go directly from your machine to your chosen provider.

P4 Bot sends basic product usage events (provider, model, token totals—no prompts or file contents) to `ingest.t3.codes`, run by T3 Tools. Disable with `T3CODE_TELEMETRY_ENABLED=false` or `DO_NOT_TRACK=1`. See [Product usage data](./telemetry.md).

## Worktrees are eating my disk. How do I clean them up?

Enable automatic cleanup or run **Delete now** in **Settings → Worktrees → Cleanup**. See [Storage cleanup](./project-settings.md#storage-cleanup).

## Is there voice input?

Yes—on-device speech on iOS, Android, and macOS 26+ desktop, or via a paired environment on web/desktop/mobile. See [Voice input](./voice-input.md).

## Does it work on Windows, Mac, and Linux?

Yes, all three (desktop app and CLI). Windows users can also run agents inside WSL. See [Install](./install.md).

## Why is my provider not showing up?

Usually the provider CLI is not installed, not signed in, or not on the `PATH` of the **server machine** (especially with version managers). Authenticate on the server machine first (e.g. `codex login` or `claude auth login`) and set **Binary path** in **Settings → Providers** if needed.
