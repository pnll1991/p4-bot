import { StackActions, useNavigation } from "@react-navigation/native";
import { useGT, useMessages } from "gt-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "../../components/ui/AppBar";
import { AppText as Text } from "../../components/ui/AppText";
import { EmptyState } from "../../components/ui/EmptyState";
import { relativeTime } from "../../lib/time";
import { NativeScrollViewMarker as ScrollViewMarker } from "../../native/NativeScrollViewMarker";
import { openSettings } from "../settings/settings-navigation";
import { BotAvatar } from "./BotAvatar";
import { type BotRosterEntry, useBotRoster } from "./useBotRoster";

/** Every bot, most recently active first; a row opens the bot's chat. */
export function BotRosterScreen() {
  const gt = useGT();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { environmentId, entries, loading, error } = useBotRoster();
  // Hidden bots fold to the end, as on web, so they stay one tap away.
  const shown = entries.filter((entry) => entry.bot.hidden !== true);
  const hidden = entries.filter((entry) => entry.bot.hidden === true);

  return (
    <View className="flex-1 bg-screen">
      <AppBar
        title={gt("Bots")}
        onBack={() => {
          if (navigation.canGoBack()) navigation.goBack();
        }}
        actions={[
          {
            accessibilityLabel: gt("New bot"),
            icon: "square.and.pencil",
            onPress: () => openSettings(navigation, "SettingsBots"),
          },
        ]}
      />
      {environmentId === null ? (
        <EmptyState
          variant="plain"
          title={gt("No environment connected")}
          detail={gt("Connect an environment to view and create bots.")}
        />
      ) : error !== null ? (
        <EmptyState variant="plain" title={gt("Could not load bots")} detail={error} />
      ) : !loading && entries.length === 0 ? (
        <EmptyState
          variant="plain"
          title={gt("No bots yet")}
          detail={gt("Create one from the New bot button.")}
        />
      ) : (
        <ScrollViewMarker style={{ flex: 1 }}>
          <ScrollView
            className="flex-1"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}
          >
            {[...shown, ...hidden].map((entry, index) => (
              <View key={entry.bot.projectId}>
                {index === shown.length ? (
                  <Text className="px-2 pb-1 pt-4 text-xs font-t3-medium text-foreground-muted">
                    {gt("Hidden")}
                  </Text>
                ) : null}
                <BotRosterRow
                  entry={entry}
                  onPress={() =>
                    navigation.dispatch(
                      StackActions.push("BotChat", {
                        environmentId: String(environmentId),
                        projectId: String(entry.bot.projectId),
                      }),
                    )
                  }
                />
              </View>
            ))}
          </ScrollView>
        </ScrollViewMarker>
      )}
    </View>
  );
}

function BotRosterRow(props: { readonly entry: BotRosterEntry; readonly onPress: () => void }) {
  const messages = useMessages();
  const { entry } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={entry.bot.name}
      onPress={props.onPress}
      className="flex-row items-center gap-3 rounded-2xl px-2 py-2.5 active:bg-subtle"
    >
      <View>
        <BotAvatar seed={entry.bot.providerInstanceId} name={entry.bot.name} size={44} />
        {entry.needsYou ? (
          <View className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-screen bg-warning" />
        ) : null}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="min-w-0 flex-1 font-t3-bold text-base text-foreground">
            {entry.bot.name}
          </Text>
          {entry.lastActivityAt ? (
            <Text className="text-xs text-foreground-muted">
              {relativeTime(entry.lastActivityAt, undefined, messages)}
            </Text>
          ) : null}
        </View>
        <Text numberOfLines={1} className="text-sm text-foreground-muted">
          {entry.preview ?? entry.bot.persona}
        </Text>
      </View>
    </Pressable>
  );
}

/** Bot faces above the thread list: the quickest way into a bot's chat from Home. */
export function BotStrip() {
  const gt = useGT();
  const navigation = useNavigation();
  const roster = useBotRoster();
  const { environmentId } = roster;
  const entries = roster.entries.filter((entry) => entry.bot.hidden !== true);
  if (environmentId === null || entries.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}
    >
      {entries.map((entry) => (
        <Pressable
          key={entry.bot.projectId}
          accessibilityRole="button"
          accessibilityLabel={gt("Chat with {name}", { name: entry.bot.name })}
          onPress={() =>
            navigation.dispatch(
              StackActions.push("BotChat", {
                environmentId: String(environmentId),
                projectId: String(entry.bot.projectId),
              }),
            )
          }
          className="w-16 items-center gap-1"
        >
          <View>
            <BotAvatar seed={entry.bot.providerInstanceId} name={entry.bot.name} size={48} />
            {entry.needsYou ? (
              <View className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-screen bg-warning" />
            ) : null}
          </View>
          <Text numberOfLines={1} className="text-xs text-foreground">
            {entry.bot.name}
          </Text>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={gt("All bots")}
        onPress={() => navigation.dispatch(StackActions.push("Bots"))}
        className="w-16 items-center gap-1"
      >
        <View className="size-12 items-center justify-center rounded-full bg-subtle">
          <Text className="text-lg text-foreground">···</Text>
        </View>
        <Text numberOfLines={1} className="text-xs text-foreground-muted">
          {gt("All bots")}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
