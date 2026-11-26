import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { type BotProfile, type ProjectId, ProjectId as ProjectIdSchema } from "@t3tools/contracts";
import { Navigate, useParams, useSearch } from "@tanstack/react-router";
import { useGT } from "gt-react";
import { ListTreeIcon } from "lucide-react";
import { createContext, useEffect, useSyncExternalStore } from "react";

import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { botEnvironment } from "../../state/bots";
import { waitForProject } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { SharedTooltipTrigger } from "../ui/shared-tooltip";
import { Toggle } from "../ui/toggle";
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

/** The bot that owns this project, if any. Reads only the bot list, never the thread shells. */
export function useBotProfile(projectId: ProjectId | null): BotProfile | null {
  const environmentId = usePrimaryEnvironmentId();
  const bots = useEnvironmentQuery(
    environmentId === null || projectId === null
      ? null
      : botEnvironment.list({ environmentId, input: {} }),
  );
  return (bots.data?.bots ?? []).find((bot) => bot.projectId === projectId) ?? null;
}

/** Whether this project belongs to a bot. */
export function useIsBotProject(projectId: ProjectId | null): boolean {
  return useBotProfile(projectId) !== null;
}

/** True when the thread view should show the compact bot chat. */
export function useBotCompactView(projectId: ProjectId | null): boolean {
  const isBot = useIsBotProject(projectId);
  const mode = useBotChatMode();
  return isBot && mode === "compact";
}

/** Set by the thread view so the timeline can drop tool steps in the compact bot chat. */
export const BotCompactContext = createContext(false);

/**
 * The bot whose chat the thread view shows, or null. Replies carry its face and name, and
 * branching actions hide, since a bot is one conversation.
 */
export const BotThreadContext = createContext<BotProfile | null>(null);

/** The thread header's controls for a bot thread: the density switch and the bot's details. */
export function BotThreadHeaderControls({ projectId }: { readonly projectId: ProjectId | null }) {
  const gt = useGT();
  const isBot = useIsBotProject(projectId);
  const mode = useBotChatMode();
  if (!isBot) return null;
  const label = mode === "full" ? gt("Hide work steps") : gt("Show work steps");
  // One icon like the panel toggle beside it: pressed shows every step, released reads as chat.
  return (
    <SharedTooltipTrigger render={<span className="flex shrink-0" />} label={label} side="bottom">
      <Toggle
        className="shrink-0 [-webkit-app-region:no-drag]"
        pressed={mode === "full"}
        onPressedChange={(pressed) => setMode(pressed ? "full" : "compact")}
        aria-label={label}
        variant="ghost"
        size="sm"
      >
        <ListTreeIcon className="size-4" />
      </Toggle>
    </SharedTooltipTrigger>
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
