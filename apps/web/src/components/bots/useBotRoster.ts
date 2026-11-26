import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { BotProfile, EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { botEnvironment } from "../../state/bots";
import { useVisibleThreadShells } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";

export interface BotRosterEntry {
  readonly bot: BotProfile;
  /** The bot's most recently active chat, the one its row opens. */
  readonly latestThread: EnvironmentThreadShell | null;
  /** All of the bot's chats, most recent first. */
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly preview: string | null;
  readonly lastActivityAt: string | null;
  readonly needsYou: boolean;
}

function newestFirst(left: EnvironmentThreadShell, right: EnvironmentThreadShell): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

/** Every bot with its latest chat, most recently active first. */
export function useBotRoster(): {
  readonly environmentId: EnvironmentId | null;
  readonly entries: ReadonlyArray<BotRosterEntry>;
  readonly loading: boolean;
  /** The bot list has answered, so an empty roster really means no bots. */
  readonly ready: boolean;
} {
  const environmentId = usePrimaryEnvironmentId();
  const bots = useEnvironmentQuery(
    environmentId === null ? null : botEnvironment.list({ environmentId, input: {} }),
  );
  const shells = useVisibleThreadShells();

  const entries = (() => {
    const byProject = new Map<ProjectId, EnvironmentThreadShell[]>();
    for (const shell of shells) {
      if (shell.environmentId !== environmentId || shell.archivedAt !== null) continue;
      const list = byProject.get(shell.projectId) ?? [];
      list.push(shell);
      byProject.set(shell.projectId, list);
    }
    return (bots.data?.bots ?? [])
      .map((bot): BotRosterEntry => {
        const threads = (byProject.get(bot.projectId) ?? []).toSorted(newestFirst);
        const latestThread = threads[0] ?? null;
        const latestMessage = latestThread?.source.latestVisibleMessage ?? null;
        return {
          bot,
          latestThread,
          threads,
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
      .toSorted((left, right) =>
        (right.lastActivityAt ?? "").localeCompare(left.lastActivityAt ?? ""),
      );
  })();

  return {
    environmentId,
    entries,
    loading: bots.isPending && bots.data === null,
    ready: bots.isSuccess || bots.error !== null,
  };
}

/** Today shows the time, this week the weekday, older the date. */
export function formatRosterTime(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const ageDays = (now - date.getTime()) / 86_400_000;
  if (new Date(now).toDateString() === date.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (ageDays < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}
