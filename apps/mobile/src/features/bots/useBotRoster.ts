import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { BotProfile, EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { botEnvironment } from "../../state/bots";
import { useVisibleThreadShells } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";

export interface BotRosterEntry {
  readonly bot: BotProfile;
  /** The bot's most recently active chat, the one its row opens. */
  readonly latestThread: EnvironmentThreadShell | null;
  readonly preview: string | null;
  readonly lastActivityAt: string | null;
  readonly needsYou: boolean;
}

/** Bots live on one environment at a time here, like Settings → Bots: the first connected one. */
export function useBotEnvironmentId(): EnvironmentId | null {
  const { environments } = useEnvironments();
  return (
    environments.find(
      (entry) => entry.connection.phase === "connected" && entry.serverConfig !== null,
    )?.environmentId ?? null
  );
}

function newestFirst(left: EnvironmentThreadShell, right: EnvironmentThreadShell): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

/** Every bot with its latest chat, most recently active first. */
export function useBotRoster(): {
  readonly environmentId: EnvironmentId | null;
  readonly entries: ReadonlyArray<BotRosterEntry>;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
} {
  const environmentId = useBotEnvironmentId();
  const bots = useEnvironmentQuery(
    environmentId === null ? null : botEnvironment.list({ environmentId, input: {} }),
  );
  const shells = useVisibleThreadShells();

  const byProject = new Map<ProjectId, EnvironmentThreadShell[]>();
  for (const shell of shells) {
    if (shell.environmentId !== environmentId || shell.archivedAt !== null) continue;
    const list = byProject.get(shell.projectId) ?? [];
    list.push(shell);
    byProject.set(shell.projectId, list);
  }
  const entries = [...(bots.data?.bots ?? [])]
    .map((bot): BotRosterEntry => {
      const threads = [...(byProject.get(bot.projectId) ?? [])].sort(newestFirst);
      const latestThread = threads[0] ?? null;
      const latestMessage = latestThread?.source.latestVisibleMessage ?? null;
      return {
        bot,
        latestThread,
        preview: latestMessage?.text.trim() || latestThread?.title || null,
        lastActivityAt:
          latestMessage === null
            ? (latestThread?.updatedAt ?? null)
            : DateTime.formatIso(latestMessage.updatedAt),
        needsYou: threads.some(
          (thread) => thread.hasPendingApprovals || thread.hasPendingUserInput,
        ),
      };
    })
    // Pinned bots first, as on web; within each, the most recently active.
    .sort(
      (left, right) =>
        Number(right.bot.pinned === true) - Number(left.bot.pinned === true) ||
        (right.lastActivityAt ?? "").localeCompare(left.lastActivityAt ?? ""),
    );

  return {
    environmentId,
    entries,
    loading: bots.isPending && bots.data === null,
    error: bots.error,
    refresh: bots.refresh,
  };
}
