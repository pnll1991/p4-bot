import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  type BotProfile,
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
import { useNavigate, useParams } from "@tanstack/react-router";
import * as DateTime from "effect/DateTime";
import { T, useGT } from "gt-react";
import {
  ArrowUpIcon,
  ExternalLinkIcon,
  PanelRightIcon,
  PaperclipIcon,
  PlusIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn, newMessageId, newThreadId } from "../../lib/utils";
import {
  useAssistantMessageText,
  useThreadShell,
  useThreadVisibleTurnItems,
} from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { DEFAULT_INTERACTION_MODE } from "../../types";
import ChatMarkdown from "../ChatMarkdown";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { BotAvatar } from "./BotAvatar";
import { BotDetails, failureMessage } from "./BotDetailPage";
import { isToday, useBotRoster } from "./useBotRoster";

const CONVERSATION_WIDTH = "mx-auto w-full max-w-3xl";
const WORKING_STATUSES = new Set(["preparing", "queued", "starting", "running"]);

/** A bot's chat: its latest conversation, or a fresh one after "New chat". */
export function BotConversationPage() {
  const gt = useGT();
  const params = useParams({ from: "/_chat/bots_/$projectId" });
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
  const choice = chosen?.projectId === projectId ? chosen.threadId : null;
  const threadId = choice === "new" ? null : (choice ?? entry.latestThread?.id ?? null);

  return (
    <div className="flex h-dvh min-h-0 min-w-0 flex-1">
      <Conversation
        key={threadId ?? "new"}
        environmentId={environmentId}
        bot={entry.bot}
        threadRef={threadId === null ? null : scopeThreadRef(environmentId, threadId)}
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
  onNewChat,
  onThreadStarted,
  detailsOpen,
  onToggleDetails,
}: {
  readonly environmentId: EnvironmentId;
  readonly bot: BotProfile;
  readonly threadRef: ScopedThreadRef | null;
  readonly onNewChat: () => void;
  readonly onThreadStarted: (threadId: ThreadId) => void;
  readonly detailsOpen: boolean;
  readonly onToggleDetails: () => void;
}) {
  const gt = useGT();
  const navigate = useNavigate();
  const items = useThreadVisibleTurnItems(threadRef);
  const shell = useThreadShell(threadRef);
  const working = WORKING_STATUSES.has(shell?.runtime?.status ?? "idle");
  const lastError = shell?.runtime?.lastError ?? null;
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const messages = items.filter(isShown);

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
        <div className="ml-auto flex items-center gap-0.5">
          {threadRef ? (
            <HeaderButton
              label={gt("Open as thread")}
              onClick={() =>
                void navigate({
                  to: "/$environmentId/$threadId",
                  params: { environmentId, threadId: threadRef.threadId },
                })
              }
            >
              <ExternalLinkIcon className="size-4" />
            </HeaderButton>
          ) : null}
          <HeaderButton label={gt("New chat")} onClick={onNewChat}>
            <SquarePenIcon className="size-4" />
          </HeaderButton>
          <HeaderButton label={gt("Bot details")} active={detailsOpen} onClick={onToggleDetails}>
            <PanelRightIcon className="size-4" />
          </HeaderButton>
        </div>
      </header>

      {/* Reversed so the scroll position stays pinned to the newest message as replies arrive. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-5">
        <div className={cn(CONVERSATION_WIDTH, "flex min-h-full flex-col pb-4")}>
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
              <BotAvatar seed={bot.providerInstanceId} name={bot.name} className="size-14" />
              <h1 className="font-medium text-lg">{gt("Message {name}", { name: bot.name })}</h1>
              <p className="max-w-md text-muted-foreground text-sm">{bot.persona}</p>
            </div>
          ) : (
            <div className="mt-auto flex flex-col gap-1 pt-6">
              <DayDivider at={startedAt(messages[0])} />
              {messages.map((projected, index) => (
                <MessageRow
                  key={projected.item.id}
                  projected={projected}
                  previous={messages[index - 1]}
                  bot={bot}
                  environmentId={environmentId}
                  threadRef={threadRef}
                />
              ))}
              {working ? <TypingRow bot={bot} /> : null}
              {lastError && !working ? (
                <p className="mt-3 ml-10 text-destructive text-xs">{lastError}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <Composer botName={bot.name} onSend={send} />
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
  previous,
  bot,
  environmentId,
  threadRef,
}: {
  readonly projected: OrchestrationV2ProjectedTurnItem;
  readonly previous: OrchestrationV2ProjectedTurnItem | undefined;
  readonly bot: BotProfile;
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
}) {
  const { item } = projected;
  const fromBot = item.type !== "user_message";
  const startsGroup = previous === undefined || (previous.item.type !== "user_message") !== fromBot;

  if (item.type === "user_message") {
    return (
      <div className={cn("flex justify-end", startsGroup ? "mt-5" : "mt-1")}>
        <div className="max-w-[78%] whitespace-pre-wrap rounded-2xl bg-foreground/10 px-3.5 py-2 text-sm leading-6">
          {item.attachments.length > 0 ? (
            <span className="flex flex-wrap gap-1.5 pb-1">
              {item.attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="inline-flex items-center gap-1 rounded-md bg-background/60 px-2 py-0.5 text-xs"
                >
                  <PaperclipIcon className="size-3" />
                  {attachment.name}
                </span>
              ))}
            </span>
          ) : null}
          {item.text}
        </div>
      </div>
    );
  }
  return (
    <BotRow bot={bot} startsGroup={startsGroup}>
      {item.type === "assistant_message" ? (
        <AssistantText
          threadRef={threadRef}
          itemId={item.id}
          text={item.text}
          streaming={item.streaming}
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
      ) : item.type === "command_execution" ? (
        <p className="truncate font-mono text-muted-foreground text-xs">$ {item.input}</p>
      ) : null}
    </BotRow>
  );
}

function BotRow({
  bot,
  startsGroup,
  children,
}: {
  readonly bot: BotProfile;
  readonly startsGroup: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-3", startsGroup ? "mt-5" : "mt-1")}>
      {startsGroup ? (
        <BotAvatar seed={bot.providerInstanceId} name={bot.name} className="mt-0.5 size-7" />
      ) : (
        <div aria-hidden="true" className="size-7 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        {startsGroup ? <div className="font-medium text-sm">{bot.name}</div> : null}
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
}: {
  readonly threadRef: ScopedThreadRef | null;
  readonly itemId: OrchestrationV2ProjectedTurnItem["item"]["id"];
  readonly text: string;
  readonly streaming: boolean;
}) {
  const live = useAssistantMessageText(streaming ? threadRef : null, itemId);
  return (
    <ChatMarkdown
      className="mt-1 text-sm"
      text={live ?? text}
      cwd={undefined}
      isStreaming={streaming}
      streamingId={itemId}
      {...(threadRef ? { threadRef } : {})}
    />
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
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
        {prompt}
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
  onSend,
}: {
  readonly botName: string;
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
          <button
            type="button"
            aria-label={gt("Send")}
            disabled={!canSend}
            onClick={() => void submit()}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-30"
          >
            <ArrowUpIcon className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
