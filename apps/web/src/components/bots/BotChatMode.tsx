import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  type EnvironmentId,
  type ProjectId,
  ProjectId as ProjectIdSchema,
  type ThreadId,
} from "@t3tools/contracts";
import { Navigate, useParams, useSearch } from "@tanstack/react-router";
import { useGT } from "gt-react";
import { BotIcon } from "lucide-react";
import { createContext, useEffect, useState, useSyncExternalStore } from "react";

import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { cn } from "../../lib/utils";
import { botEnvironment } from "../../state/bots";
import { waitForProject } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { Sheet, SheetHeader, SheetPopup, SheetTitle } from "../ui/sheet";
import { BotDetails } from "./BotDetailPage";
import { useBotRoster } from "./useBotRoster";

/**
 * A bot chat is the thread view in one of two densities: compact shows the conversation only,
 * full adds every tool step and the thread's panels. Text, composer and layout stay put.
 */
type BotChatMode = "compact" | "full";

const MODE_STORAGE_KEY = "p4:bot-chat-mode";
const MODE_EVENT = "p4:bot-chat-mode";

function readMode(): BotChatMode {
  return window.localStorage.getItem(MODE_STORAGE_KEY) === "full" ? "full" : "compact";
}

function subscribeMode(onChange: () => void): () => void {
  window.addEventListener(MODE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(MODE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function setMode(mode: BotChatMode): void {
  window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  window.dispatchEvent(new Event(MODE_EVENT));
}

function useBotChatMode(): BotChatMode {
  return useSyncExternalStore(subscribeMode, readMode);
}

/** Whether this project belongs to a bot. Reads only the bot list, never the thread shells. */
export function useIsBotProject(projectId: ProjectId | null): boolean {
  const environmentId = usePrimaryEnvironmentId();
  const bots = useEnvironmentQuery(
    environmentId === null || projectId === null
      ? null
      : botEnvironment.list({ environmentId, input: {} }),
  );
  return (bots.data?.bots ?? []).some((bot) => bot.projectId === projectId);
}

/** True when the thread view should show the compact bot chat. */
export function useBotCompactView(projectId: ProjectId | null): boolean {
  const isBot = useIsBotProject(projectId);
  const mode = useBotChatMode();
  return isBot && mode === "compact";
}

/** Set by the thread view so the timeline can drop tool steps in the compact bot chat. */
export const BotCompactContext = createContext(false);

/** The thread header's controls for a bot thread: the density switch and the bot's details. */
export function BotThreadHeaderControls({
  environmentId,
  projectId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId | null;
  readonly threadId: ThreadId;
}) {
  const gt = useGT();
  const isBot = useIsBotProject(projectId);
  const mode = useBotChatMode();
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (!isBot || projectId === null) return null;
  const options: ReadonlyArray<{ readonly value: BotChatMode; readonly label: string }> = [
    { value: "compact", label: gt("Compact") },
    { value: "full", label: gt("Full") },
  ];
  return (
    <div className="flex shrink-0 items-center gap-1">
      <div
        role="radiogroup"
        aria-label={gt("Chat view")}
        className="flex items-center rounded-lg bg-foreground/6 p-0.5"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            onClick={() => setMode(option.value)}
            className={cn(
              "rounded-md px-2 py-0.5 font-medium text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              mode === option.value
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label={gt("Bot details")}
        onClick={() => setDetailsOpen(true)}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <BotIcon className="size-4" />
      </button>
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetPopup side="right" className="w-[min(92vw,28rem)]">
          <SheetHeader className="sr-only">
            <SheetTitle>{gt("Bot details")}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {detailsOpen ? (
              <BotDetails environmentId={environmentId} projectId={projectId} threadId={threadId} />
            ) : null}
          </div>
        </SheetPopup>
      </Sheet>
    </div>
  );
}

/** `/bots/$projectId` opens the bot's chat: the asked-for one, its latest, or a new draft. */
export function BotChatRedirect() {
  const params = useParams({ from: "/_chat/bots_/$projectId" });
  const search = useSearch({ from: "/_chat/bots_/$projectId" });
  const projectId = ProjectIdSchema.make(params.projectId);
  const { environmentId, entries, ready } = useBotRoster();
  const newThread = useNewThreadHandler();
  const entry = entries.find((candidate) => candidate.bot.projectId === projectId);
  const threadId =
    entry?.threads.find((thread) => thread.id === search.thread)?.id ?? entry?.latestThread?.id;
  const needsDraft =
    environmentId !== null && ready && entry !== undefined && threadId === undefined;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a bot with no chat yet opens a new draft, which navigates
  useEffect(() => {
    if (!needsDraft || environmentId === null) return;
    const projectRef = scopeProjectRef(environmentId, projectId);
    void waitForProject(projectRef)
      .catch(() => null)
      .then(() => newThread(projectRef, { replace: true }));
  }, [needsDraft, environmentId, projectId, newThread]);

  if (environmentId === null || !ready) return null;
  if (entry === undefined) return <Navigate to="/bots" replace />;
  if (threadId !== undefined) {
    return <Navigate to="/$environmentId/$threadId" params={{ environmentId, threadId }} replace />;
  }
  return null;
}
