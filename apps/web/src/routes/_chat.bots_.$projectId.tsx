import { createFileRoute } from "@tanstack/react-router";

import { BotChatRedirect } from "../components/bots/BotChatMode";

export const Route = createFileRoute("/_chat/bots_/$projectId")({
  // `thread` opens one of the bot's chats instead of its latest.
  validateSearch: (search: Record<string, unknown>): { thread?: string } =>
    typeof search.thread === "string" ? { thread: search.thread } : {},
  component: BotChatRedirect,
});
