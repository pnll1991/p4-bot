import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useGT } from "gt-react";
import { BotIcon } from "lucide-react";

import { ITEM_ICON_CLASS, type CommandPaletteActionItem } from "./CommandPalette.logic";
import { useBotRoster } from "./bots/useBotRoster";

const NO_BOT_ITEMS: ReadonlyArray<CommandPaletteActionItem> = [];

/**
 * Every bot as a palette row that opens its chat. Hidden bots are listed too: a search is how
 * the owner finds a bot they folded away. Only a search lists bots, like settings.
 * `isBotProject` lets project search skip the project behind each bot, which its row replaces.
 */
export function useCommandPaletteBotItems(searching: boolean): {
  readonly botItems: ReadonlyArray<CommandPaletteActionItem>;
  readonly isBotProject: (environmentId: EnvironmentId, projectId: ProjectId) => boolean;
} {
  const gt = useGT();
  const navigate = useNavigate();
  const { environmentId, entries } = useBotRoster();
  const botProjectIds = new Set(entries.map(({ bot }) => bot.projectId));
  const isBotProject = (projectEnvironmentId: EnvironmentId, projectId: ProjectId) =>
    projectEnvironmentId === environmentId && botProjectIds.has(projectId);
  if (!searching) return { botItems: NO_BOT_ITEMS, isBotProject };
  const botItems = entries.map(({ bot }): CommandPaletteActionItem => ({
    kind: "action",
    value: `bot:${bot.projectId}`,
    searchTerms: [bot.name, ...(bot.group ? [bot.group] : [])],
    title: bot.name,
    description: bot.group ? gt("Bot · {group}", { group: bot.group }) : gt("Bot"),
    icon: <BotIcon className={ITEM_ICON_CLASS} />,
    run: async () => {
      await navigate({ to: "/bots/$projectId", params: { projectId: bot.projectId } });
    },
  }));
  return { botItems, isBotProject };
}
