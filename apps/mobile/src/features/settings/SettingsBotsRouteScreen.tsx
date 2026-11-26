import type { BotProfile, BotRuntime, EnvironmentId } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { StackActions, useNavigation } from "@react-navigation/native";
import { T, useGT } from "gt-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import * as Dialog from "../../components/ui/Dialog";
import { FormField, FormSection } from "../../components/ui/FormSection";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { botEnvironment } from "../../state/bots";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import { useSettingsEnvironmentFilter } from "./settings-environment-filter";

const DEFAULT_MODEL: Record<BotRuntime, string> = {
  pi: "maya/inkling-2-mini",
  codex: "gpt-5.5",
  claudeAgent: "claude-sonnet-5-5",
};

const RUNTIME_LABEL: Record<BotRuntime, string> = {
  pi: "Pi",
  codex: "Codex",
  claudeAgent: "Claude Code",
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

export function SettingsBotsRouteScreen() {
  const gt = useGT();
  const insets = useSafeAreaInsets();
  const { availableTargets } = useSettingsEnvironmentFilter();
  const environmentId = availableTargets[0]?.environmentId ?? null;

  return (
    <SettingsScreen title={gt("Bots")}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <Text className="px-2 text-sm text-foreground-muted">
          <T>
            Each bot has its own folder, memory and provider sign-in, usable only in its own
            project. New bots start Supervised.
          </T>
        </Text>
        {environmentId === null ? (
          <Text className="px-2 text-base text-foreground-muted">
            {gt("Connect an environment to view and create bots.")}
          </Text>
        ) : (
          <EnvironmentBots environmentId={environmentId} />
        )}
      </ScrollView>
    </SettingsScreen>
  );
}

function EnvironmentBots({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const gt = useGT();
  const bots = useEnvironmentQuery(botEnvironment.list({ environmentId, input: {} }));
  const createBot = useAtomCommand(botEnvironment.create, { reportFailure: false });
  const navigation = useNavigation();
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [runtime, setRuntime] = useState<BotRuntime>("pi");
  const [model, setModel] = useState(DEFAULT_MODEL.pi);
  const [creating, setCreating] = useState(false);
  const list = bots.data?.bots ?? [];

  const openBot = (bot: BotProfile) =>
    navigation.dispatch(
      StackActions.push("BotChat", {
        environmentId: String(environmentId),
        projectId: String(bot.projectId),
      }),
    );

  const submit = async () => {
    if (name.trim() === "" || persona.trim() === "" || model.trim() === "") return;
    setCreating(true);
    const result = await createBot({
      environmentId,
      input: { name: name.trim(), persona: persona.trim(), runtime, model: model.trim() },
    });
    setCreating(false);
    if (result._tag === "Failure") {
      Dialog.alert(
        gt("Could not create the bot"),
        errorMessage(squashAtomCommandFailure(result), gt("An error occurred.")),
      );
      return;
    }
    setName("");
    setPersona("");
    bots.refresh();
    openBot(result.value);
  };

  return (
    <>
      {bots.error !== null ? (
        <Text className="px-2 text-sm text-danger">{bots.error}</Text>
      ) : list.length === 0 ? (
        <Text className="px-2 text-base text-foreground-muted">{gt("No bots yet")}</Text>
      ) : (
        <SettingsSection>
          {list.map((bot) => (
            <ListActionRow
              key={bot.projectId}
              icon="robot"
              label={bot.name}
              description={`${RUNTIME_LABEL[bot.runtime]} · ${bot.model}`}
              onPress={() => openBot(bot)}
            />
          ))}
        </SettingsSection>
      )}

      <FormSection title={gt("New bot")}>
        <FormField
          accessibilityLabel={gt("Name")}
          label={gt("Name")}
          placeholder={gt("Name")}
          value={name}
          maxLength={200}
          onChangeText={setName}
        />
        <FormField
          accessibilityLabel={gt("Instructions")}
          label={gt("Instructions")}
          placeholder={gt("What the bot does, how it talks, and what it must never do.")}
          value={persona}
          multiline
          onChangeText={setPersona}
        />
        <SegmentedControl
          options={(["pi", "claudeAgent", "codex"] as const).map((value) => ({
            value,
            label: RUNTIME_LABEL[value],
          }))}
          selected={runtime}
          onSelect={(value) => {
            setRuntime(value);
            setModel(DEFAULT_MODEL[value]);
          }}
          variant="card"
          size="compact"
        />
        <FormField
          accessibilityLabel={gt("Model")}
          label={gt("Model")}
          placeholder={gt("Model")}
          value={model}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setModel}
        />
        <View className="pt-1">
          <Button
            label={gt("Create bot")}
            tone="primary"
            loading={creating}
            disabled={name.trim() === "" || persona.trim() === "" || model.trim() === ""}
            onPress={() => void submit()}
          />
        </View>
      </FormSection>
    </>
  );
}
