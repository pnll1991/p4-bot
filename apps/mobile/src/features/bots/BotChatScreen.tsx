import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  type BotProfile,
  EnvironmentId,
  MessageId,
  type OrchestrationV2ProjectedTurnItem,
  type OrchestrationV2ThreadProjection,
  ProjectId,
  type ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { T, useGT } from "gt-react-native";
import * as DateTime from "effect/DateTime";
import { Atom } from "effect/reactivity";
import { useRef, useState } from "react";
import { ScrollView, View, type ScrollViewInstance } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "../../components/ui/AppBar";
import { AppText as Text, AppTextInput as TextInput } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import * as Dialog from "../../components/ui/Dialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { GlassSurface } from "../../components/ui/GlassSurface";
import { uuidv4 } from "../../lib/uuid";
import { NativeScrollViewMarker as ScrollViewMarker } from "../../native/NativeScrollViewMarker";
import { SelectableMarkdownText } from "../../native/SelectableMarkdownText";
import {
  environmentThreadDetails,
  threadEnvironment,
  useEnvironmentThread,
} from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useThreadShell } from "../../state/entities";
import { useMarkdownPreviewStyles } from "../files/FileMarkdownPreview";
import { BotAvatar } from "./BotAvatar";
import { useBotRoster } from "./useBotRoster";

export type BotChatParams = {
  readonly environmentId: string;
  readonly projectId: string;
};

const EMPTY_ITEMS_ATOM = Atom.make<OrchestrationV2ThreadProjection["visibleTurnItems"]>(
  Object.freeze([]),
).pipe(Atom.withLabel("mobile-bot-chat-items:empty"));

const WORKING_STATUSES = new Set(["preparing", "queued", "starting", "running"]);

function failureMessage(result: unknown, fallback: string): string {
  const error = squashAtomCommandFailure(result as never);
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/** A bot's chat: its latest conversation, or a fresh one after "New chat". */
export function BotChatScreen({ route }: StaticScreenProps<BotChatParams>) {
  const gt = useGT();
  const navigation = useNavigation();
  const environmentId = EnvironmentId.make(route.params.environmentId);
  const projectId = ProjectId.make(route.params.projectId);
  const { entries, loading } = useBotRoster();
  const entry = entries.find((candidate) => candidate.bot.projectId === projectId) ?? null;
  // A chat started here before the roster sees it, or "new" for an empty one.
  const [chosen, setChosen] = useState<ThreadId | "new" | null>(null);
  const threadId = chosen === "new" ? null : (chosen ?? entry?.latestThread?.id ?? null);

  const onBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  if (entry === null) {
    return (
      <View className="flex-1 bg-screen">
        <AppBar title={gt("Bot")} onBack={onBack} />
        <EmptyState
          variant="plain"
          title={loading ? gt("Loading the bot…") : gt("This bot no longer exists.")}
          detail={loading ? gt("One moment.") : gt("It may have been removed.")}
        />
      </View>
    );
  }

  return (
    <Conversation
      key={threadId ?? "new"}
      environmentId={environmentId}
      bot={entry.bot}
      threadRef={threadId === null ? null : { environmentId, threadId }}
      onBack={onBack}
      onNewChat={() => setChosen("new")}
      onThreadStarted={setChosen}
    />
  );
}

function Conversation(props: {
  readonly environmentId: EnvironmentId;
  readonly bot: BotProfile;
  readonly threadRef: ScopedThreadRef | null;
  readonly onBack: () => void;
  readonly onNewChat: () => void;
  readonly onThreadStarted: (threadId: ThreadId) => void;
}) {
  const { environmentId, bot, threadRef } = props;
  const gt = useGT();
  const insets = useSafeAreaInsets();
  // Subscribes to the thread so its items stream in while this screen is open.
  useEnvironmentThread(environmentId, threadRef?.threadId ?? null);
  const shell = useThreadShell(threadRef);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const items = useAtomValue(
    threadRef === null
      ? EMPTY_ITEMS_ATOM
      : environmentThreadDetails.visibleTurnItemsAtom(threadRef),
  );
  const shown = items.filter(isShown);
  const runtimeStatus = shell?.runtime?.status ?? "idle";
  const working = WORKING_STATUSES.has(runtimeStatus);
  const startTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [composerHeight, setComposerHeight] = useState(56);
  const bottomInset = Math.max(insets.bottom, 12);

  const send = async () => {
    const body = text.trim();
    if (body === "" || sending) return;
    setSending(true);
    const createdAt = new Date().toISOString();
    const threadId = threadRef?.threadId ?? ThreadId.make(uuidv4());
    const result = await startTurn({
      environmentId,
      input: {
        threadId,
        message: { messageId: MessageId.make(uuidv4()), role: "user", text: body, attachments: [] },
        // Bots always ask before acting; the server's BotGuard screens what reaches the owner.
        runtimeMode: "approval-required",
        interactionMode: "default",
        dispatchMode: "auto",
        createdAt,
        ...(threadRef === null
          ? {
              titleSeed: body,
              bootstrap: {
                createThread: {
                  projectId: bot.projectId,
                  title: body.slice(0, 60),
                  modelSelection: { instanceId: bot.providerInstanceId, model: bot.model },
                  runtimeMode: "approval-required",
                  interactionMode: "default",
                  branch: null,
                  worktreePath: null,
                  createdAt,
                },
              },
            }
          : {}),
      },
    });
    setSending(false);
    if (result._tag === "Failure") {
      Dialog.alert(gt("Could not send"), failureMessage(result, gt("Try again.")));
      return;
    }
    setText("");
    if (threadRef === null) props.onThreadStarted(threadId);
  };

  return (
    <KeyboardAvoidingView automaticOffset behavior="height" className="flex-1 bg-screen">
      <AppBar
        title={bot.name}
        onBack={props.onBack}
        actions={[
          {
            accessibilityLabel: gt("New chat"),
            icon: "square.and.pencil",
            onPress: props.onNewChat,
          },
        ]}
      />
      <ScrollViewMarker style={{ flex: 1 }}>
        <ScrollView
          className="flex-1"
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ref={scrollRef}
          // Keeps the newest message in view as replies arrive.
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "flex-end",
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: composerHeight + bottomInset + 16,
          }}
        >
          {shown.length === 0 ? (
            <View className="flex-1 items-center justify-center gap-3 py-12">
              <BotAvatar seed={bot.providerInstanceId} name={bot.name} size={56} />
              <Text className="font-t3-medium text-lg text-foreground">
                {gt("Message {name}", { name: bot.name })}
              </Text>
              <Text className="px-6 text-center text-sm text-foreground-muted">{bot.persona}</Text>
            </View>
          ) : (
            <View>
              <DayDivider at={startedAt(shown[0])} />
              {shown.map((projected, index) => (
                <MessageRow
                  key={projected.item.id}
                  projected={projected}
                  previous={shown[index - 1]}
                  bot={bot}
                  environmentId={environmentId}
                  threadRef={threadRef}
                />
              ))}
              {working ? (
                <View className="mt-5 flex-row items-center gap-3">
                  <BotAvatar seed={bot.providerInstanceId} name={bot.name} size={28} />
                  <Text className="text-sm text-foreground-muted">
                    <T>Thinking…</T>
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </ScrollViewMarker>
      <View className="absolute inset-x-4 bottom-0" style={{ paddingBottom: bottomInset }}>
        <GlassSurface
          chrome="none"
          onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
          className="flex-row items-end gap-1 p-1"
        >
          <TextInput
            accessibilityLabel={gt("Message {name}", { name: bot.name })}
            multiline
            maxLength={65536}
            placeholder={gt("Message {name}", { name: bot.name })}
            placeholderTextColorClassName="accent-foreground-muted"
            value={text}
            onChangeText={setText}
            editable={!sending}
            className="max-h-36 min-h-12 min-w-0 flex-1 rounded-[24px] border-0 bg-transparent px-4 py-3 text-base text-foreground"
          />
          <View>
            <Button
              label={gt("Send")}
              tone="contrast"
              loading={sending}
              disabled={sending || text.trim() === ""}
              onPress={() => void send()}
            />
          </View>
        </GlassSurface>
      </View>
    </KeyboardAvoidingView>
  );
}

function isShown(projected: OrchestrationV2ProjectedTurnItem): boolean {
  const { item } = projected;
  switch (item.type) {
    case "user_message":
      return item.text.trim() !== "";
    case "assistant_message":
      return item.phase !== "commentary";
    case "approval_request":
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

function isToday(date: Date): boolean {
  return new Date().toDateString() === date.toDateString();
}

function DayDivider({ at }: { readonly at: Date | null }) {
  const gt = useGT();
  if (at === null || Number.isNaN(at.getTime())) return null;
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const label = isToday(at)
    ? gt("Today {time}", { time })
    : `${at.toLocaleDateString(undefined, { dateStyle: "medium" })} ${time}`;
  return (
    <View className="my-4 flex-row items-center gap-3">
      <View className="h-px flex-1 bg-border-subtle" />
      <Text className="text-xs text-foreground-muted">{label}</Text>
      <View className="h-px flex-1 bg-border-subtle" />
    </View>
  );
}

function MessageRow(props: {
  readonly projected: OrchestrationV2ProjectedTurnItem;
  readonly previous: OrchestrationV2ProjectedTurnItem | undefined;
  readonly bot: BotProfile;
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
}) {
  const { item } = props.projected;
  const fromBot = item.type !== "user_message";
  const startsGroup =
    props.previous === undefined || (props.previous.item.type !== "user_message") !== fromBot;

  if (item.type === "user_message") {
    return (
      <View className={startsGroup ? "mt-5 items-end" : "mt-1 items-end"}>
        <View className="max-w-[80%] rounded-2xl bg-subtle px-3.5 py-2">
          <Text selectable className="text-base text-foreground">
            {item.text}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View className={startsGroup ? "mt-5 flex-row gap-3" : "mt-1 flex-row gap-3"}>
      {startsGroup ? (
        <BotAvatar seed={props.bot.providerInstanceId} name={props.bot.name} size={28} />
      ) : (
        <View style={{ width: 28 }} />
      )}
      <View className="min-w-0 flex-1">
        {startsGroup ? (
          <Text className="font-t3-medium text-sm text-foreground">{props.bot.name}</Text>
        ) : null}
        {item.type === "assistant_message" ? (
          <BotMarkdown text={item.text} />
        ) : item.type === "approval_request" ? (
          <ApprovalCard
            environmentId={props.environmentId}
            threadRef={props.threadRef}
            requestId={item.requestId}
            prompt={item.prompt ?? item.title ?? ""}
          />
        ) : item.type === "user_input_request" ? (
          <Text className="mt-1 text-sm text-foreground-muted">
            <T>Has a question for you. Answer it from the thread list.</T>
          </Text>
        ) : item.type === "command_execution" ? (
          <Text numberOfLines={1} className="mt-1 font-mono text-xs text-foreground-muted">
            $ {item.input}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function BotMarkdown({ text }: { readonly text: string }) {
  const styles = useMarkdownPreviewStyles();
  return (
    <View className="mt-1">
      <SelectableMarkdownText markdown={text} textStyle={styles.nativeTextStyle} />
    </View>
  );
}

type ApprovalRequestId = Extract<
  OrchestrationV2ProjectedTurnItem["item"],
  { type: "approval_request" }
>["requestId"];

function ApprovalCard(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
  readonly requestId: ApprovalRequestId;
  readonly prompt: string;
}) {
  const gt = useGT();
  const respond = useAtomCommand(threadEnvironment.respondToApproval, { reportFailure: false });
  const [busy, setBusy] = useState(false);

  const answer = async (decision: "accept" | "decline") => {
    if (props.threadRef === null || busy) return;
    setBusy(true);
    const result = await respond({
      environmentId: props.environmentId,
      input: { threadId: props.threadRef.threadId, requestId: props.requestId, decision },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      Dialog.alert(gt("Could not answer"), failureMessage(result, gt("Try again.")));
    }
  };

  return (
    <View className="mt-2 gap-2 rounded-2xl border border-border-subtle bg-card p-3">
      <Text className="text-xs text-foreground-muted">{gt("Wants to run")}</Text>
      <Text selectable className="font-mono text-xs text-foreground">
        {props.prompt}
      </Text>
      <View className="flex-row gap-2 pt-1">
        <Button
          label={gt("Approve")}
          tone="contrast"
          disabled={busy}
          onPress={() => void answer("accept")}
        />
        <Button label={gt("Decline")} disabled={busy} onPress={() => void answer("decline")} />
      </View>
    </View>
  );
}
