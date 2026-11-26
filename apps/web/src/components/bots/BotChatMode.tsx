import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useGT } from "gt-react";

import { cn } from "../../lib/utils";
import { useBotRoster } from "./useBotRoster";

/** One bot chat, two ways to read it: the plain conversation or the full thread with every step. */
export type BotChatMode = "compact" | "full";

const MODE_STORAGE_KEY = "p4:bot-chat-mode";

export function readBotChatMode(): BotChatMode {
  return window.localStorage.getItem(MODE_STORAGE_KEY) === "full" ? "full" : "compact";
}

function writeBotChatMode(mode: BotChatMode): void {
  window.localStorage.setItem(MODE_STORAGE_KEY, mode);
}

export function writeFullMode(): void {
  writeBotChatMode("full");
}

/** Opens a bot chat the way the user last chose to read it. */
export function useOpenBotChat() {
  const navigate = useNavigate();
  return (input: {
    readonly environmentId: EnvironmentId;
    readonly projectId: ProjectId;
    readonly threadId: ThreadId | null;
    readonly mode?: BotChatMode;
    readonly replace?: boolean;
  }) => {
    const mode = input.mode ?? readBotChatMode();
    if (input.mode) writeBotChatMode(input.mode);
    if (mode === "full" && input.threadId !== null) {
      return navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: input.environmentId, threadId: input.threadId },
        ...(input.replace ? { replace: true } : {}),
      });
    }
    return navigate({
      to: "/bots/$projectId",
      params: { projectId: input.projectId },
      search: input.threadId === null ? {} : { thread: input.threadId },
      ...(input.replace ? { replace: true } : {}),
    });
  };
}

export function BotChatModeSwitch({
  mode,
  onChange,
}: {
  readonly mode: BotChatMode;
  readonly onChange: (mode: BotChatMode) => void;
}) {
  const gt = useGT();
  const options: ReadonlyArray<{ readonly value: BotChatMode; readonly label: string }> = [
    { value: "compact", label: gt("Compact") },
    { value: "full", label: gt("Full") },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={gt("Chat view")}
      className="flex shrink-0 items-center rounded-lg bg-foreground/6 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={mode === option.value}
          onClick={() => {
            if (mode !== option.value) onChange(option.value);
          }}
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
  );
}

/** The switch inside the full thread view, shown only when the thread belongs to a bot. */
export function BotThreadModeSwitch({
  environmentId,
  projectId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId | null;
  readonly threadId: ThreadId;
}) {
  const { entries } = useBotRoster();
  const openBotChat = useOpenBotChat();
  const isBot = projectId !== null && entries.some((entry) => entry.bot.projectId === projectId);
  if (!isBot || projectId === null) return null;
  return (
    <BotChatModeSwitch
      mode="full"
      onChange={(mode) => void openBotChat({ environmentId, projectId, threadId, mode })}
    />
  );
}
