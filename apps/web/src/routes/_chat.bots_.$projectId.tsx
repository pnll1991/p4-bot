import { createFileRoute } from "@tanstack/react-router";

import { BotDetailPage } from "../components/bots/BotDetailPage";

export const Route = createFileRoute("/_chat/bots_/$projectId")({
  component: BotDetailPage,
});
