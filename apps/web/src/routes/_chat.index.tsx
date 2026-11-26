import { createFileRoute, Navigate } from "@tanstack/react-router";

import { readBotChatMode } from "../components/bots/BotChatMode";
import { useBotRoster } from "../components/bots/useBotRoster";
import { HostedEmptyState } from "../components/HostedEmptyState";
import { useEnvironments } from "../state/environments";

function ChatIndexRouteView() {
  const { authGateState } = Route.useRouteContext();
  const { environments, isReady } = useEnvironments();

  if (authGateState.status === "hosted-static") {
    if (!isReady) return null;
    if (environments.length === 0) return <HostedEmptyState />;
  }

  return <BotHome />;
}

/** Home is the bot you talked to last; with no bots yet, the page that creates one. */
function BotHome() {
  const { environmentId, entries, ready } = useBotRoster();
  if (environmentId === null || !ready) return null;
  const latest = entries[0];
  if (latest === undefined) return <Navigate to="/bots" replace />;
  return readBotChatMode() === "full" && latest.latestThread !== null ? (
    <Navigate
      to="/$environmentId/$threadId"
      params={{ environmentId, threadId: latest.latestThread.id }}
      replace
    />
  ) : (
    <Navigate to="/bots/$projectId" params={{ projectId: latest.bot.projectId }} replace />
  );
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
