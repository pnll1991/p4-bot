import { createFileRoute } from "@tanstack/react-router";

import { BotConversationPage } from "../components/bots/BotConversationPage";

export const Route = createFileRoute("/_chat/bots_/$projectId")({
  // `thread` opens one of the bot's chats instead of its latest.
  validateSearch: (search: Record<string, unknown>): { thread?: string } =>
    typeof search.thread === "string" ? { thread: search.thread } : {},
  component: BotConversationPage,
});
