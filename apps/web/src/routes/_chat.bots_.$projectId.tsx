import { createFileRoute } from "@tanstack/react-router";

import { BotConversationPage } from "../components/bots/BotConversationPage";

export const Route = createFileRoute("/_chat/bots_/$projectId")({
  component: BotConversationPage,
});
