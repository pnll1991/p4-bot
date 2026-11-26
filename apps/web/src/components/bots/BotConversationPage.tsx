import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  type BotProfile,
  type ChatAttachment,
  type EnvironmentId,
  type OrchestrationV2ProjectedTurnItem,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  ProjectId,
  type ScopedThreadRef,
  type ThreadId,
  type UploadChatImageAttachment,
} from "@t3tools/contracts";
import {
  buildPendingUserInputAnswers,
  type PendingUserInputDraftAnswer,
} from "@t3tools/client-runtime/state/pending-user-input";
import { useParams, useSearch } from "@tanstack/react-router";
import * as DateTime from "effect/DateTime";
import { T, useGT } from "gt-react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  HistoryIcon,
  ReplyIcon,
  LoaderIcon,
  SquareIcon,
  PanelRightIcon,
  PaperclipIcon,
  PlusIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { cn, newMessageId, newThreadId } from "../../lib/utils";
import {
  useAssistantMessageText,
  useThreadShell,
  useThreadVisibleTurnItems,
} from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { DEFAULT_INTERACTION_MODE } from "../../types";
import { useAssetUrls } from "../../assets/assetUrls";
import { selectMessageImageResources } from "../../session-logic";
import ChatMarkdown from "../ChatMarkdown";
import { AttachmentImage } from "../media/AttachmentImage";
import { toastManager } from "../ui/toast";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { BotAvatar } from "./BotAvatar";
import { BotChatModeSwitch, useOpenBotChat, writeFullMode } from "./BotChatMode";
import { BotDetails, failureMessage } from "./BotDetailPage";
import { formatRosterTime, isToday, useBotRoster } from "./useBotRoster";

const CONVERSATION_WIDTH = "mx-auto w-full max-w-3xl";
const COMPOSER_ID = "bot-composer";
const WORKING_STATUSES = new Set(["preparing", "queued", "starting", "running"]);

/** A bot's chat: its latest conversation, or a fresh one after "New chat". */
export function BotConversationPage() {
  const gt = useGT();
  const params = useParams({ from: "/_chat/bots_/$projectId" });
  const search = useSearch({ from: "/_chat/bots_/$projectId" });
  const projectId = ProjectId.make(params.projectId);
  const { environmentId, entries, loading } = useBotRoster();
  const entry = entries.find((candidate) => candidate.bot.projectId === projectId) ?? null;
  // A chat the user just started, before the roster sees it; or "new" for an empty one.
  const [chosen, setChosen] = useState<{ projectId: ProjectId; threadId: ThreadId | "new" } | null>(
    null,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (environmentId === null) return null;
  if (entry === null) {
    return (
      <div className="flex h-dvh flex-1 items-center justify-center text-muted-foreground text-sm">
        {loading ? null : gt("This bot no longer exists.")}
      </div>
    );
  }
  const linked = entry.threads.find((thread) => thread.id === search.thread)?.id ?? null;
  const choice = chosen?.projectId === projectId ? chosen.threadId : linked;
  const threadId = choice === "new" ? null : (choice ?? entry.latestThread?.id ?? null);

  return (
    <div className="flex h-dvh min-h-0 min-w-0 flex-1">
      <Conversation
        key={threadId ?? "new"}
        environmentId={environmentId}
        bot={entry.bot}
        threadRef={threadId === null ? null : scopeThreadRef(environmentId, threadId)}
        chats={entry.threads}
        onSelectChat={(id) => setChosen({ projectId, threadId: id })}
        onNewChat={() => setChosen({ projectId, threadId: "new" })}
        onThreadStarted={(id) => setChosen({ projectId, threadId: id })}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((open) => !open)}
      />
      {detailsOpen ? (
        <aside className="flex w-[26rem] shrink-0 flex-col overflow-y-auto border-l bg-background p-5">
          <BotDetails environmentId={environmentId} projectId={projectId} />
        </aside>
      ) : null}
    </div>
  );
}

function Conversation({
  environmentId,
  bot,
  threadRef,
  chats,
  onSelectChat,
  onNewChat,
  onThreadStarted,
  detailsOpen,
  onToggleDetails,
}: {
  readonly environmentId: EnvironmentId;
  readonly bot: BotProfile;
  readonly threadRef: ScopedThreadRef | null;
  readonly chats: ReadonlyArray<EnvironmentThreadShell>;
  readonly onSelectChat: (threadId: ThreadId) => void;
  readonly onNewChat: () => void;
  readonly onThreadStarted: (threadId: ThreadId) => void;
  readonly detailsOpen: boolean;
  readonly onToggleDetails: () => void;
}) {
  const gt = useGT();
  const openBotChat = useOpenBotChat();
  const newThread = useNewThreadHandler();
  const items = useThreadVisibleTurnItems(threadRef);
  const shell = useThreadShell(threadRef);
  const working = WORKING_STATUSES.has(shell?.runtime?.status ?? "idle");
  const lastError = shell?.runtime?.lastError ?? null;
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const messages = items.filter(isShown);
  const rows = groupRows(messages);
  const interrupt = useOrchestrationCommand(threadEnvironment.interruptTurn, {
    reportFailure: false,
  });
  const stop = async () => {
    if (threadRef === null) return;
    const result = await interrupt({ environmentId, input: { threadId: threadRef.threadId } });
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: gt("Could not stop"),
        description: failureMessage(result, gt("Try again.")),
      });
    }
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const send = async (
    text: string,
    attachments: ReadonlyArray<UploadChatImageAttachment>,
  ): Promise<boolean> => {
    const createdAt = new Date().toISOString();
    const threadId = threadRef?.threadId ?? newThreadId();
    const result = await startTurn({
      environmentId,
      input: {
        threadId,
        message: { messageId: newMessageId(), role: "user", text, attachments },
        // Bots always ask before acting; the server's BotGuard screens what reaches the owner.
        runtimeMode: "approval-required",
        interactionMode: DEFAULT_INTERACTION_MODE,
        dispatchMode: "auto",
        createdAt,
        ...(threadRef === null
          ? {
              titleSeed: text || gt("Image"),
              bootstrap: {
                createThread: {
                  projectId: bot.projectId,
                  title: text.slice(0, 60) || gt("Image"),
                  modelSelection: { instanceId: bot.providerInstanceId, model: bot.model },
                  runtimeMode: "approval-required",
                  interactionMode: DEFAULT_INTERACTION_MODE,
                  branch: null,
                  worktreePath: null,
                  createdAt,
                },
              },
            }
          : {}),
      },
    });
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: gt("Could not send"),
        description: failureMessage(result, gt("Try again.")),
      });
      return false;
    }
    if (threadRef === null) onThreadStarted(threadId);
    return true;
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-5">
        <BotAvatar seed={bot.providerInstanceId} name={bot.name} className="size-6" />
        <span className="truncate font-medium text-sm">{bot.name}</span>
        {shell?.hasPendingApprovals || shell?.hasPendingUserInput ? (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning text-xs">
            {gt("Needs you")}
          </span>
        ) : working ? (
          <span className="text-muted-foreground text-xs">{gt("Working…")}</span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
          <BotChatModeSwitch
            mode="compact"
            onChange={(mode) => {
              if (threadRef !== null) {
                void openBotChat({
                  environmentId,
                  projectId: bot.projectId,
                  threadId: threadRef.threadId,
                  mode,
                });
                return;
              }
              // A chat that does not exist yet opens as a full draft in the bot's project.
              writeFullMode();
              void newThread(scopeProjectRef(environmentId, bot.projectId));
            }}
          />
          {chats.length > 0 ? (
            <ChatsMenu
              chats={chats}
              currentThreadId={threadRef?.threadId ?? null}
              onSelect={onSelectChat}
            />
          ) : null}
          <HeaderButton label={gt("New chat")} onClick={onNewChat}>
            <SquarePenIcon className="size-4" />
          </HeaderButton>
          <HeaderButton label={gt("Bot details")} active={detailsOpen} onClick={onToggleDetails}>
            <PanelRightIcon className="size-4" />
          </HeaderButton>
        </div>
      </header>

      {/* Reversed so the scroll position stays pinned to the newest message as replies arrive;
          scrollTop is 0 at the bottom and negative above it. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={(event) => setAwayFromBottom(event.currentTarget.scrollTop < -120)}
          className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-5"
        >
          <div className={cn(CONVERSATION_WIDTH, "flex min-h-full shrink-0 flex-col pb-4")}>
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
                <BotAvatar seed={bot.providerInstanceId} name={bot.name} className="size-14" />
                <h1 className="font-medium text-lg">{gt("Message {name}", { name: bot.name })}</h1>
                <p className="max-w-md text-muted-foreground text-sm">{bot.persona}</p>
              </div>
            ) : (
              <div className="mt-auto flex flex-col gap-1 pt-6">
                <DayDivider at={startedAt(messages[0])} />
                {rows.map((row, index) => {
                  const previous = rows[index - 1];
                  const startsGroup =
                    previous === undefined || rowFromBot(previous) !== rowFromBot(row);
                  return row.kind === "steps" ? (
                    <BotRow key={row.key} bot={bot} startsGroup={startsGroup}>
                      <StepsRow steps={row.steps} />
                    </BotRow>
                  ) : (
                    <MessageRow
                      key={row.projected.item.id}
                      onReply={(text) => {
                        setReplyTo(text);
                        document.getElementById(COMPOSER_ID)?.focus();
                      }}
                      projected={row.projected}
                      startsGroup={startsGroup}
                      bot={bot}
                      environmentId={environmentId}
                      threadRef={threadRef}
                    />
                  );
                })}
                {working ? <TypingRow bot={bot} /> : null}
                {lastError && !working ? (
                  <p className="mt-3 ml-10 text-destructive text-xs">{lastError}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
        {awayFromBottom ? (
          <button
            type="button"
            aria-label={gt("Jump to latest")}
            onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            className="absolute bottom-3 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border bg-card text-foreground shadow-md hover:bg-accent"
          >
            <ArrowDownIcon className="size-4" />
          </button>
        ) : null}
      </div>

      <Composer
        botName={bot.name}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        onSend={(text, attachments) =>
          send(replyTo === null ? text : `${quote(replyTo)}\n\n${text}`, attachments)
        }
        working={working && threadRef !== null}
        onStop={() => void stop()}
      />
    </div>
  );
}

function isShown(projected: OrchestrationV2ProjectedTurnItem): boolean {
  const { item } = projected;
  switch (item.type) {
    case "user_message":
      return item.text.trim() !== "" || item.attachments.length > 0;
    case "assistant_message":
      return item.phase !== "commentary";
    case "approval_request":
      // Once answered, the command row below it already shows what ran.
      return item.status === "waiting";
    case "user_input_request":
      return item.status === "waiting";
    case "command_execution":
      return item.title !== "Workspace ready";
    default:
      return false;
  }
}

type CommandItem = Extract<OrchestrationV2ProjectedTurnItem["item"], { type: "command_execution" }>;

type ConversationRow =
  | { readonly kind: "item"; readonly projected: OrchestrationV2ProjectedTurnItem }
  | { readonly kind: "steps"; readonly key: string; readonly steps: ReadonlyArray<CommandItem> };

/** Back-to-back commands collapse into one row of steps, so tool work never buries the reply. */
function groupRows(
  messages: ReadonlyArray<OrchestrationV2ProjectedTurnItem>,
): ReadonlyArray<ConversationRow> {
  const rows: ConversationRow[] = [];
  for (const projected of messages) {
    const { item } = projected;
    const last = rows.at(-1);
    if (item.type === "command_execution") {
      if (last?.kind === "steps") {
        rows[rows.length - 1] = { ...last, steps: [...last.steps, item] };
      } else {
        rows.push({ kind: "steps", key: item.id, steps: [item] });
      }
    } else {
      rows.push({ kind: "item", projected });
    }
  }
  return rows;
}

function rowFromBot(row: ConversationRow): boolean {
  return row.kind === "steps" || row.projected.item.type !== "user_message";
}

function stepFailed(step: CommandItem): boolean {
  return (
    step.status === "failed" ||
    step.outputIndicatesFailure === true ||
    (step.exitCode !== undefined && step.exitCode !== 0)
  );
}

function StepsRow({ steps }: { readonly steps: ReadonlyArray<CommandItem> }) {
  const gt = useGT();
  const [open, setOpen] = useState(false);
  const failed = steps.filter(stepFailed).length;
  const running = steps.some((step) => step.status === "running");
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-md py-0.5 text-muted-foreground text-xs hover:text-foreground"
      >
        <ChevronRightIcon className={cn("size-3.5", open && "rotate-90")} />
        {running
          ? gt("Running a command")
          : gt("{count, plural, =1 {Ran 1 command} other {Ran {count} commands}}", {
              count: steps.length,
            })}
        {failed > 0 ? (
          <span className="text-destructive">
            · {gt("{count, plural, =1 {1 failed} other {{count} failed}}", { count: failed })}
          </span>
        ) : null}
      </button>
      {open ? (
        <ul className="mt-1 flex flex-col gap-1 border-l pl-3">
          {steps.map((step) => (
            <StepLine key={step.id} step={step} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const OUTPUT_LINE_LIMIT = 40;

function StepLine({ step }: { readonly step: CommandItem }) {
  const gt = useGT();
  const [open, setOpen] = useState(false);
  const output = step.output?.trimEnd() ?? "";
  const lines = output.split("\n");
  const shown =
    lines.length > OUTPUT_LINE_LIMIT ? lines.slice(-OUTPUT_LINE_LIMIT).join("\n") : output;
  return (
    <li className="list-none text-xs">
      <button
        type="button"
        aria-expanded={output === "" ? undefined : open}
        disabled={output === ""}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-2 text-left enabled:hover:text-foreground"
      >
        {step.status === "running" ? (
          <LoaderIcon className="mt-0.5 size-3 shrink-0 animate-spin text-muted-foreground" />
        ) : stepFailed(step) ? (
          <XIcon className="mt-0.5 size-3 shrink-0 text-destructive" />
        ) : (
          <CheckIcon className="mt-0.5 size-3 shrink-0 text-success" />
        )}
        <code className="min-w-0 whitespace-pre-wrap break-all font-mono text-muted-foreground">
          {step.input}
        </code>
      </button>
      {open ? (
        <pre className="mt-1 ml-5 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted px-2.5 py-2 font-mono text-muted-foreground">
          {lines.length > OUTPUT_LINE_LIMIT
            ? `${gt("Last {count} lines", { count: OUTPUT_LINE_LIMIT })}\n${shown}`
            : shown}
        </pre>
      ) : null}
    </li>
  );
}

/** Approval prompts arrive as the tool's JSON arguments; show the command itself when there is one. */
function readableRequest(prompt: string): string {
  try {
    const parsed: unknown = JSON.parse(prompt);
    if (typeof parsed === "object" && parsed !== null && "command" in parsed) {
      const { command } = parsed as { command: unknown };
      if (typeof command === "string") return command;
    }
  } catch {
    // Not JSON: the prompt is already prose.
  }
  return prompt;
}

function startedAt(projected: OrchestrationV2ProjectedTurnItem | undefined): Date | null {
  if (projected === undefined) return null;
  const { item } = projected;
  return new Date(DateTime.toEpochMillis(item.startedAt ?? item.updatedAt));
}

function DayDivider({ at }: { readonly at: Date | null }) {
  const gt = useGT();
  if (at === null || Number.isNaN(at.getTime())) return null;
  const today = isToday(at);
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const label = today
    ? gt("Today {time}", { time })
    : `${at.toLocaleDateString(undefined, { dateStyle: "medium" })} ${time}`;
  return (
    <div className="my-4 flex items-center gap-3 text-muted-foreground text-xs">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function MessageRow({
  projected,
  onReply,
  startsGroup,
  bot,
  environmentId,
  threadRef,
}: {
  readonly projected: OrchestrationV2ProjectedTurnItem;
  readonly onReply: (text: string) => void;
  readonly startsGroup: boolean;
  readonly bot: BotProfile;
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
}) {
  const { item } = projected;

  if (item.type === "user_message") {
    return (
      <div
        className={cn(
          "group/message flex items-end justify-end gap-2",
          startsGroup ? "mt-5" : "mt-1",
        )}
      >
        <MessageTime item={item} />
        <div className="flex max-w-[78%] flex-col items-end gap-1.5">
          {item.attachments.length > 0 ? (
            <UserAttachments environmentId={environmentId} attachments={item.attachments} />
          ) : null}
          {item.text.trim() !== "" ? (
            <div className="whitespace-pre-wrap rounded-2xl bg-foreground/10 px-3.5 py-2 text-sm leading-6">
              {item.text}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <BotRow bot={bot} startsGroup={startsGroup} time={<MessageTime item={item} />}>
      {item.type === "assistant_message" ? (
        <AssistantText
          threadRef={threadRef}
          itemId={item.id}
          text={item.text}
          streaming={item.streaming}
          onReply={onReply}
        />
      ) : item.type === "approval_request" ? (
        <ApprovalCard
          environmentId={environmentId}
          threadRef={threadRef}
          requestId={item.requestId}
          prompt={item.prompt ?? item.title ?? ""}
        />
      ) : item.type === "user_input_request" ? (
        <QuestionCard environmentId={environmentId} threadRef={threadRef} item={item} />
      ) : null}
    </BotRow>
  );
}

/** The message's time, shown while the pointer is over its row. */
function MessageTime({ item }: { readonly item: OrchestrationV2ProjectedTurnItem["item"] }) {
  const at = new Date(DateTime.toEpochMillis(item.startedAt ?? item.updatedAt));
  return (
    <time
      dateTime={at.toISOString()}
      className="shrink-0 text-muted-foreground text-xs tabular-nums opacity-0 group-hover/message:opacity-100 pointer-coarse:hidden"
    >
      {at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
    </time>
  );
}

function UserAttachments({
  environmentId,
  attachments,
}: {
  readonly environmentId: EnvironmentId;
  readonly attachments: ReadonlyArray<ChatAttachment>;
}) {
  const resources = selectMessageImageResources(attachments);
  const urls = useAssetUrls(environmentId, resources);
  const urlById = new Map(
    resources.flatMap((resource, index) => {
      const url = urls[index];
      return url ? [[resource.attachmentId, url] as const] : [];
    }),
  );
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {attachments.map((attachment) => {
        const url = attachment.type === "image" ? urlById.get(attachment.id) : undefined;
        return url ? (
          <a key={attachment.id} href={url} target="_blank" rel="noreferrer">
            <AttachmentImage
              name={attachment.name}
              mimeType={attachment.mimeType}
              src={url}
              alt={attachment.name}
              loading="lazy"
              className="max-h-48 max-w-64 rounded-2xl border object-cover"
            />
          </a>
        ) : (
          <span
            key={attachment.id}
            className="inline-flex items-center gap-1 rounded-lg bg-foreground/10 px-2.5 py-1 text-xs"
          >
            <PaperclipIcon className="size-3" />
            {attachment.name}
          </span>
        );
      })}
    </div>
  );
}

function BotRow({
  bot,
  startsGroup,
  time,
  children,
}: {
  readonly bot: BotProfile;
  readonly startsGroup: boolean;
  readonly time?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className={cn("group/message flex items-start gap-3", startsGroup ? "mt-5" : "mt-1")}>
      {startsGroup ? (
        <BotAvatar seed={bot.providerInstanceId} name={bot.name} className="mt-0.5 size-7" />
      ) : (
        <div aria-hidden="true" className="size-7 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        {startsGroup ? (
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-sm">{bot.name}</span>
            {time}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function AssistantText({
  threadRef,
  itemId,
  text,
  streaming,
  onReply,
}: {
  readonly onReply: (text: string) => void;
  readonly threadRef: ScopedThreadRef | null;
  readonly itemId: OrchestrationV2ProjectedTurnItem["item"]["id"];
  readonly text: string;
  readonly streaming: boolean;
}) {
  const gt = useGT();
  const live = useAssistantMessageText(streaming ? threadRef : null, itemId);
  const [copied, setCopied] = useState(false);
  const shown = live ?? text;
  const copy = async () => {
    await navigator.clipboard.writeText(shown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="group/reply">
      <ChatMarkdown
        className="mt-1 text-sm"
        text={shown}
        cwd={undefined}
        isStreaming={streaming}
        streamingId={itemId}
        {...(threadRef ? { threadRef } : {})}
      />
      {streaming ? null : (
        <div className="mt-0.5 -mb-3 flex gap-0.5 opacity-0 focus-within:opacity-100 group-hover/reply:opacity-100 pointer-coarse:opacity-100">
          <ReplyAction label={copied ? gt("Copied") : gt("Copy reply")} onClick={() => void copy()}>
            {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          </ReplyAction>
          <ReplyAction label={gt("Reply")} onClick={() => onReply(shown)}>
            <ReplyIcon className="size-3.5" />
          </ReplyAction>
        </div>
      )}
    </div>
  );
}

function ReplyAction({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

const QUOTE_LIMIT = 280;

/** A reply carries the quoted text as Markdown so every runtime sees what it answers. */
function quote(text: string): string {
  const trimmed = text.trim();
  const short = trimmed.length > QUOTE_LIMIT ? `${trimmed.slice(0, QUOTE_LIMIT)}…` : trimmed;
  return short
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function ChatsMenu({
  chats,
  currentThreadId,
  onSelect,
}: {
  readonly chats: ReadonlyArray<EnvironmentThreadShell>;
  readonly currentThreadId: ThreadId | null;
  readonly onSelect: (threadId: ThreadId) => void;
}) {
  const gt = useGT();
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            aria-label={gt("Chats")}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <HistoryIcon className="size-4" />
          </button>
        }
      />
      <MenuPopup align="end" className="max-h-96 w-72">
        {chats.map((chat) => (
          <MenuItem key={chat.id} onClick={() => onSelect(chat.id)}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn("truncate", chat.id === currentThreadId && "font-medium")}>
                {chat.title}
              </span>
              <span className="text-muted-foreground text-xs">
                {formatRosterTime(chat.updatedAt)}
              </span>
            </span>
            {chat.id === currentThreadId ? <CheckIcon className="size-3.5" /> : null}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

function ApprovalCard({
  environmentId,
  threadRef,
  requestId,
  prompt,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
  readonly requestId: Extract<
    OrchestrationV2ProjectedTurnItem["item"],
    { type: "approval_request" }
  >["requestId"];
  readonly prompt: string;
}) {
  const gt = useGT();
  const respond = useOrchestrationCommand(threadEnvironment.respondToApproval, {
    reportFailure: false,
  });
  const [busy, setBusy] = useState(false);

  const answer = async (decision: "accept" | "decline") => {
    if (threadRef === null) return;
    setBusy(true);
    const result = await respond({
      environmentId,
      input: { threadId: threadRef.threadId, requestId, decision },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: gt("Could not answer"),
        description: failureMessage(result, gt("Try again.")),
      });
    }
  };

  return (
    <div className="mt-2 rounded-xl border bg-card p-3">
      <p className="font-medium text-xs text-muted-foreground">{gt("Wants to run")}</p>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted px-2.5 py-2 font-mono text-xs">
        {readableRequest(prompt)}
      </pre>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void answer("accept")}
          className="rounded-lg bg-foreground px-3 py-1.5 font-medium text-background text-xs disabled:opacity-50"
        >
          {gt("Approve")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void answer("decline")}
          className="rounded-lg bg-foreground/10 px-3 py-1.5 font-medium text-xs disabled:opacity-50"
        >
          {gt("Decline")}
        </button>
      </div>
    </div>
  );
}

type UserInputItem = Extract<
  OrchestrationV2ProjectedTurnItem["item"],
  { type: "user_input_request" }
>;

/** The bot's questions, answered in place: pick an option or type an answer. */
function QuestionCard({
  environmentId,
  threadRef,
  item,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
  readonly item: UserInputItem;
}) {
  const gt = useGT();
  const respond = useOrchestrationCommand(threadEnvironment.respondToUserInput, {
    reportFailure: false,
  });
  const [drafts, setDrafts] = useState<Record<string, PendingUserInputDraftAnswer>>({});
  const [busy, setBusy] = useState(false);
  const answers = buildPendingUserInputAnswers(item.questions, drafts);

  const pick = (questionId: string, value: string, multiSelect: boolean) =>
    setDrafts((current) => {
      const selected = current[questionId]?.selectedOptionValues ?? [];
      const next = multiSelect
        ? selected.includes(value)
          ? selected.filter((entry) => entry !== value)
          : [...selected, value]
        : [value];
      return { ...current, [questionId]: { customAnswer: "", selectedOptionValues: next } };
    });

  const submit = async () => {
    if (threadRef === null || answers === null) return;
    setBusy(true);
    const result = await respond({
      environmentId,
      input: { threadId: threadRef.threadId, requestId: item.requestId, answers },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: gt("Could not answer"),
        description: failureMessage(result, gt("Try again.")),
      });
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-4 rounded-xl border bg-card p-3">
      {item.questions.map((question) => {
        const draft = drafts[question.id];
        const selected = draft?.selectedOptionValues ?? [];
        const acceptsText = question.allowCustomAnswer === true || question.options.length === 0;
        return (
          <div key={question.id} className="flex flex-col gap-2">
            <p className="font-medium text-muted-foreground text-xs">{question.header}</p>
            <p className="text-sm">{question.question}</p>
            {question.options.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {question.options.map((option) => {
                  const value = option.value ?? option.label;
                  const chosen = selected.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={chosen}
                      onClick={() => pick(question.id, value, question.multiSelect === true)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs",
                        chosen
                          ? "border-foreground bg-foreground text-background"
                          : "hover:bg-accent",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {acceptsText ? (
              <input
                value={draft?.customAnswer ?? ""}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [question.id]: { customAnswer: event.target.value },
                  }))
                }
                placeholder={gt("Type your answer")}
                className="h-8 rounded-lg border bg-background px-3 text-sm outline-none focus:border-ring"
              />
            ) : null}
          </div>
        );
      })}
      <div>
        <button
          type="button"
          disabled={busy || answers === null}
          onClick={() => void submit()}
          className="rounded-lg bg-foreground px-3 py-1.5 font-medium text-background text-xs disabled:opacity-40"
        >
          {gt("Send answer")}
        </button>
      </div>
    </div>
  );
}

function TypingRow({ bot }: { readonly bot: BotProfile }) {
  return (
    <div className="mt-5 flex items-center gap-3">
      <BotAvatar seed={bot.providerInstanceId} name={bot.name} className="size-7" />
      <span className="text-muted-foreground text-sm">
        <T>Thinking…</T>
      </span>
    </div>
  );
}

function HeaderButton({
  label,
  active = false,
  onClick,
  children,
}: {
  readonly label: string;
  readonly active?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              active && "bg-accent text-foreground",
            )}
          >
            {children}
          </button>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function Composer({
  botName,
  replyTo,
  onClearReply,
  onSend,
  working,
  onStop,
}: {
  readonly botName: string;
  readonly replyTo: string | null;
  readonly onClearReply: () => void;
  readonly working: boolean;
  readonly onStop: () => void;
  readonly onSend: (
    text: string,
    attachments: ReadonlyArray<UploadChatImageAttachment>,
  ) => Promise<boolean>;
}) {
  const gt = useGT();
  const [text, setText] = useState("");
  const [images, setImages] = useState<ReadonlyArray<UploadChatImageAttachment>>([]);
  const [sending, setSending] = useState(false);
  const canSend = (text.trim() !== "" || images.length > 0) && !sending;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    const sent = await onSend(text.trim(), images);
    setSending(false);
    if (sent) {
      setText("");
      setImages([]);
      onClearReply();
    }
  };

  const addFiles = async (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    const tooBig = picked.filter((file) => file.size > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES);
    if (tooBig.length > 0) {
      toastManager.add({
        type: "error",
        title: gt("Images can be up to 10 MB each"),
        description: tooBig.map((file) => file.name).join(", "),
      });
    }
    const accepted = await Promise.all(
      picked
        .filter(
          (file) =>
            file.type.startsWith("image/") && file.size <= PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
        )
        .map(async (file): Promise<UploadChatImageAttachment> => ({
          type: "image",
          name: file.name || "image",
          mimeType: file.type,
          sizeBytes: file.size,
          dataUrl: await readAsDataUrl(file),
        })),
    );
    setImages((current) => [...current, ...accepted]);
  };

  return (
    <div className="shrink-0 px-5 pb-5">
      <div
        className={cn(
          CONVERSATION_WIDTH,
          "flex flex-col rounded-3xl border bg-card px-2 py-2 shadow-xs focus-within:border-ring",
        )}
        onPaste={(event) => {
          if (event.clipboardData.files.length > 0) {
            event.preventDefault();
            void addFiles(event.clipboardData.files);
          }
        }}
      >
        {replyTo !== null ? (
          <div className="mx-1 mb-2 flex items-center gap-2 rounded-xl bg-foreground/8 px-3 py-1.5 text-xs">
            <ReplyIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{replyTo}</span>
            <button
              type="button"
              aria-label={gt("Cancel reply")}
              onClick={onClearReply}
              className="flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        ) : null}
        {images.length > 0 ? (
          <ul className="flex flex-wrap gap-2 px-1 pt-1 pb-2">
            {images.map((image, index) => (
              <li key={image.dataUrl} className="relative list-none">
                <img
                  src={image.dataUrl}
                  alt={image.name}
                  className="size-16 rounded-xl border object-cover"
                />
                <button
                  type="button"
                  aria-label={gt("Remove {name}", { name: image.name })}
                  onClick={() =>
                    setImages((current) => current.filter((_, position) => position !== index))
                  }
                  className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background"
                >
                  <XIcon className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-end gap-2">
          <label
            aria-label={gt("Attach images")}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground/8 hover:bg-foreground/12 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring"
          >
            <PlusIcon className="size-5" />
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <textarea
            // Opening a bot or a new chat is an invitation to type.
            autoFocus
            id={COMPOSER_ID}
            value={text}
            rows={1}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={gt("Message {name}", { name: botName })}
            aria-label={gt("Message {name}", { name: botName })}
            className="field-sizing-content max-h-48 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          {working && !canSend ? (
            <button
              type="button"
              aria-label={gt("Stop")}
              onClick={onStop}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
            >
              <SquareIcon className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              aria-label={gt("Send")}
              disabled={!canSend}
              onClick={() => void submit()}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-30"
            >
              <ArrowUpIcon className="size-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
