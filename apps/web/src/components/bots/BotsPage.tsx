import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { BotProfile, BotRuntime } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import { BotIcon } from "lucide-react";
import { useState } from "react";

import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { botEnvironment } from "../../state/bots";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { waitForProject } from "../../state/entities";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { WorkspacePageContainer } from "../WorkspacePageContainer";

export const DEFAULT_MODEL: Record<BotRuntime, string> = {
  pi: "maya/inkling-2-mini",
  codex: "gpt-5.5",
  claudeAgent: "claude-sonnet-5-5",
};

export const RUNTIME_LABEL: Record<BotRuntime, string> = {
  pi: "Pi",
  codex: "Codex",
  claudeAgent: "Claude Code",
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

export function BotsPage() {
  const gt = useGT();
  const environmentId = usePrimaryEnvironmentId();
  const bots = useEnvironmentQuery(
    environmentId === null ? null : botEnvironment.list({ environmentId, input: {} }),
  );
  const createBot = useAtomCommand(botEnvironment.create, { reportFailure: false });
  const newThread = useNewThreadHandler();
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [runtime, setRuntime] = useState<BotRuntime>("pi");
  const [model, setModel] = useState(DEFAULT_MODEL.pi);
  const [creating, setCreating] = useState(false);

  const openBot = async (bot: BotProfile) => {
    if (environmentId === null) return;
    const projectRef = scopeProjectRef(environmentId, bot.projectId);
    await waitForProject(projectRef).catch(() => null);
    await newThread(projectRef);
  };

  const submit = async () => {
    if (environmentId === null || name.trim() === "" || persona.trim() === "") return;
    setCreating(true);
    const result = await createBot({
      environmentId,
      input: { name: name.trim(), persona: persona.trim(), runtime, model: model.trim() },
    });
    setCreating(false);
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: gt("Could not create the bot"),
            description: errorMessage(squashAtomCommandFailure(result), gt("An error occurred.")),
          }),
        );
      }
      return;
    }
    toastManager.add(
      stackedThreadToast({
        type: "success",
        title: gt("Created {name}", { name: result.value.name }),
        description:
          result.value.runtime === "pi"
            ? gt("It uses the Pi models on this machine. It starts Supervised.")
            : gt("Sign the bot in on its first thread. It starts Supervised."),
      }),
    );
    setName("");
    setPersona("");
    bots.refresh();
    await openBot(result.value);
  };

  const list = bots.data?.bots ?? [];

  return (
    <WorkspacePageContainer>
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-xl">
          <T>Bots</T>
        </h1>
        <p className="text-muted-foreground text-sm">
          <T>
            Each bot has its own folder, memory and provider sign-in, usable only in its own
            project. New bots start Supervised.
          </T>
        </p>
      </header>

      <section className="flex flex-col gap-3">
        {bots.error !== null ? (
          <p className="text-destructive text-sm">{bots.error}</p>
        ) : list.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BotIcon />
              </EmptyMedia>
              <EmptyTitle>
                <T>No bots yet</T>
              </EmptyTitle>
              <EmptyDescription>
                <T>Create your first bot below.</T>
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {list.map((bot) => (
              <li key={bot.projectId} className="flex items-center gap-3 px-4 py-3">
                <BotIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    to="/bots/$projectId"
                    params={{ projectId: bot.projectId }}
                    className="truncate font-medium text-sm hover:underline"
                  >
                    {bot.name}
                  </Link>
                  <span className="truncate text-muted-foreground text-xs">
                    {RUNTIME_LABEL[bot.runtime]} · {bot.model}
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={() => void openBot(bot)}>
                  <T>New chat</T>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        className="flex flex-col gap-4 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="font-medium text-base">
          <T>New bot</T>
        </h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bot-name">
            <T>Name</T>
          </Label>
          <Input
            id="bot-name"
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bot-persona">
            <T>Instructions</T>
          </Label>
          <Textarea
            id="bot-persona"
            value={persona}
            rows={5}
            placeholder={gt("What the bot does, how it talks, and what it must never do.")}
            onChange={(event) => setPersona(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-1 flex-col gap-2">
            <Label>
              <T>Agent</T>
            </Label>
            <Select
              value={runtime}
              onValueChange={(value) => {
                if (value !== "pi" && value !== "codex" && value !== "claudeAgent") return;
                setRuntime(value);
                setModel(DEFAULT_MODEL[value]);
              }}
            >
              <SelectTrigger>
                <SelectValue>{(value: BotRuntime) => RUNTIME_LABEL[value]}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="pi">{RUNTIME_LABEL.pi}</SelectItem>
                <SelectItem value="claudeAgent">{RUNTIME_LABEL.claudeAgent}</SelectItem>
                <SelectItem value="codex">{RUNTIME_LABEL.codex}</SelectItem>
              </SelectPopup>
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="bot-model">
              <T>Model</T>
            </Label>
            <Input
              id="bot-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={
              creating || environmentId === null || name.trim() === "" || persona.trim() === ""
            }
          >
            <T>Create bot</T>
          </Button>
        </div>
      </form>
    </WorkspacePageContainer>
  );
}
