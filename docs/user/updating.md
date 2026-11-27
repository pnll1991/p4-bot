# Updating P4 Bot

P4 Bot clients and servers can run on different machines and must share a compatible orchestration protocol.

> P4 Bot has no releases yet, so its built-in app and server updates find nothing to install: the desktop app shows updates as off, and **Update server** or `t3 update` fail. Update every machine by pulling its checkout and rebuilding (`git pull && vp i && vp run build:desktop`). Provider updates work as usual.

## Continue threads after restarts

**Settings → Maintenance → Continue threads after restarts** is enabled by default. After an update, crash, or reboot (once P4 Bot starts again), supported active threads automatically resume—and threads waiting on subagents or monitors are woken and notified that background work stopped.

- Threads waiting for your approval/answer/secret—or archived, snoozed, or settled—are not auto-resumed.
- After 3 consecutive crash recoveries of an unfinished turn, the thread waits for your next message.
- Updating from V1? Read [Threads from older P4 Bot versions](./thread-migration.md).

## Update providers

Open **Settings → Providers** and click **Update now** on individual providers or **Update all** across connected environments. Running chats keep using their current CLI until they end; new sessions and model catalogs refresh automatically. (Provider update checks in **Settings → Maintenance** must be enabled to fetch model catalog updates.)

## Mobile updates

- Update providers from **Settings → Environments** on mobile.
- Update the mobile app by rebuilding it from `apps/mobile`.

## Troubleshooting

- **Version mismatch**: Update whichever side (app or server) the connection notice names.
- **Failed update**: Retry once; confirm you updated the host machine (not just the client) and that only one server owns the P4 Bot home directory.
- **Desktop won't start**: Use **Copy details** in the recovery window for a bug report, then rebuild from a last-working commit.
