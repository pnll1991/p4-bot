import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useGT } from "gt-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "../../components/ui/AppBar";
import { AppText as Text } from "../../components/ui/AppText";
import * as Dialog from "../../components/ui/Dialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { ListSection } from "../../components/ui/ListSection";
import { ListToggleRow } from "../../components/ui/ListToggleRow";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { botEnvironment } from "../../state/bots";
import { useAtomCommand } from "../../state/use-atom-command";
import { BotAvatar } from "./BotAvatar";
import { useBotRoster } from "./useBotRoster";

export type BotDetailsParams = {
  readonly environmentId: string;
  readonly projectId: string;
};

function failureMessage(result: unknown, fallback: string): string {
  const error = squashAtomCommandFailure(result as never);
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/**
 * What the owner changes about a bot from the phone: its permissions, a fresh conversation, where
 * it sits in the list, and deleting it. Memory, rules, routines and its agent stay on web and
 * desktop, where there is room to edit them.
 */
export function BotDetailsScreen({ route }: StaticScreenProps<BotDetailsParams>) {
  const gt = useGT();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const environmentId = EnvironmentId.make(route.params.environmentId);
  const projectId = ProjectId.make(route.params.projectId);
  const { entries, loading, refresh } = useBotRoster();
  const entry = entries.find((candidate) => candidate.bot.projectId === projectId) ?? null;
  const setPermissions = useAtomCommand(botEnvironment.setPermissions, { reportFailure: false });
  const arrange = useAtomCommand(botEnvironment.arrange, { reportFailure: false });
  const startOver = useAtomCommand(botEnvironment.startOver, { reportFailure: false });
  const deleteBot = useAtomCommand(botEnvironment.deleteBot, { reportFailure: false });
  const [busy, setBusy] = useState<"permissions" | "start-over" | "arrange" | "delete" | null>(
    null,
  );

  const onBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  if (entry === null) {
    return (
      <View className="flex-1 bg-screen">
        <AppBar title={gt("Bot settings")} onBack={onBack} />
        <EmptyState
          variant="plain"
          title={loading ? gt("Loading the bot…") : gt("This bot no longer exists.")}
          detail={loading ? gt("One moment.") : gt("It may have been removed.")}
        />
      </View>
    );
  }
  const { bot } = entry;
  const fullAccess = bot.runtimeMode === "full-access";

  const run = async (
    step: NonNullable<typeof busy>,
    command: () => Promise<{ readonly _tag: string }>,
    failureTitle: string,
  ) => {
    setBusy(step);
    const result = await command();
    setBusy(null);
    // The bot list is a query, not a subscription: re-read it so the screen shows the change.
    refresh();
    if (result._tag === "Failure") {
      Dialog.alert(failureTitle, failureMessage(result, gt("Try again.")));
      return false;
    }
    return true;
  };

  const confirmStartOver = () =>
    Dialog.confirm({
      title: gt("Start over with {name}?", { name: bot.name }),
      message: gt(
        "The current conversation is archived, not deleted. The bot keeps its memory, rules and routines.",
      ),
      confirmText: gt("Start over"),
      onConfirm: () =>
        void run(
          "start-over",
          () => startOver({ environmentId, input: { projectId } }),
          gt("Could not start over"),
        ).then((done) => {
          if (done) onBack();
        }),
    });

  const confirmDelete = () =>
    Dialog.prompt({
      title: gt("Delete {name}?", { name: bot.name }),
      message: gt(
        "This removes its routines, chats, sign-in, memory and folder. It cannot be undone. Type {name} to confirm.",
        { name: bot.name },
      ),
      initialValue: "",
      confirmText: gt("Delete bot"),
      onConfirm: (typed) => {
        if (typed.trim() !== bot.name) {
          Dialog.alert(gt("The name doesn't match"), gt("Nothing was deleted."));
          return;
        }
        void run(
          "delete",
          () => deleteBot({ environmentId, input: { projectId } }),
          gt("Could not delete the bot"),
        ).then((done) => {
          if (done) navigation.dispatch(StackActions.popToTop());
        });
      },
    });

  return (
    <View className="flex-1 bg-screen">
      <AppBar title={gt("Bot settings")} onBack={onBack} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <View className="items-center gap-2 py-2">
          <BotAvatar seed={bot.providerInstanceId} name={bot.name} size={64} />
          <Text className="font-t3-medium text-lg text-foreground">{bot.name}</Text>
          <Text className="px-6 text-center text-sm text-foreground-muted">{bot.persona}</Text>
        </View>

        <ListSection title={gt("Access")}>
          <ListToggleRow
            icon="bolt.circle"
            label={gt("Full access")}
            description={
              fullAccess ? gt("Acts without asking") : gt("Asks before commands and edits")
            }
            value={fullAccess}
            disabled={busy !== null}
            onValueChange={(on) =>
              void run(
                "permissions",
                () =>
                  setPermissions({
                    environmentId,
                    input: { projectId, runtimeMode: on ? "full-access" : "approval-required" },
                  }),
                gt("Could not change permissions"),
              )
            }
          />
        </ListSection>

        <ListSection title={gt("Conversation")}>
          <ListActionRow
            icon="arrow.clockwise"
            label={gt("Start over")}
            description={gt("Archive this conversation and start a fresh one.")}
            loading={busy === "start-over"}
            disabled={busy !== null}
            onPress={confirmStartOver}
          />
        </ListSection>

        <ListSection title={gt("Bot list")}>
          <ListActionRow
            icon={bot.pinned ? "pin.slash" : "pin"}
            label={bot.pinned ? gt("Unpin") : gt("Pin to top")}
            loading={busy === "arrange"}
            disabled={busy !== null}
            onPress={() =>
              void run(
                "arrange",
                () => arrange({ environmentId, input: { projectId, pinned: !bot.pinned } }),
                gt("Could not change the bot list"),
              )
            }
          />
          <ListActionRow
            icon={bot.hidden ? "eye" : "eye.slash"}
            label={bot.hidden ? gt("Show bot") : gt("Hide bot")}
            disabled={busy !== null}
            onPress={() =>
              void run(
                "arrange",
                () => arrange({ environmentId, input: { projectId, hidden: !bot.hidden } }),
                gt("Could not change the bot list"),
              )
            }
          />
        </ListSection>

        <ListSection
          footer={gt(
            "Edit the bot's memory, rules, routines and agent from the web or desktop app.",
          )}
        >
          <ListActionRow
            icon="trash"
            tone="danger"
            label={gt("Delete bot")}
            description={gt("Delete the bot and everything it brought.")}
            loading={busy === "delete"}
            disabled={busy !== null}
            onPress={confirmDelete}
          />
        </ListSection>
      </ScrollView>
    </View>
  );
}
