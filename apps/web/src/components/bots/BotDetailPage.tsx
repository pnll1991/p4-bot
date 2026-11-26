import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  type BotMemoryFile,
  type BotPresence,
  type BotRoutine,
  type EnvironmentId,
  MAX_BOT_ROUTINE_RUNS_PER_DAY,
  ProjectId,
  type ScheduledTaskUpsertSchedule,
} from "@t3tools/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { T, useGT, Var } from "gt-react";
import { useState } from "react";

import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { botEnvironment } from "../../state/bots";
import { waitForProject } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { WorkspacePageContainer } from "../WorkspacePageContainer";

type Frequency = "daily" | "weekdays" | "hours" | "webhook";

const HOUR_MS = 60 * 60 * 1000;

function scheduleFor(
  frequency: Frequency,
  time: string,
  hours: number,
): ScheduledTaskUpsertSchedule {
  switch (frequency) {
    case "daily":
      return { type: "fixed_time", timeOfDay: time };
    case "weekdays":
      return { type: "fixed_time", timeOfDay: time, weekdays: [1, 2, 3, 4, 5] };
    case "hours":
      return { type: "interval", everyMs: Math.max(1, hours) * HOUR_MS };
    case "webhook":
      return { type: "webhook" };
  }
}

/** Mirrors the server's rate so the owner sees the cost before saving. */
function runsPerDay(frequency: Frequency, hours: number): number | null {
  switch (frequency) {
    case "daily":
      return 1;
    case "weekdays":
      return 5 / 7;
    case "hours":
      return 24 / Math.max(1, hours);
    case "webhook":
      return null;
  }
}

function failureMessage(result: unknown, fallback: string): string {
  const error = squashAtomCommandFailure(result as never);
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function PresenceBadge({ presence }: { readonly presence: BotPresence }) {
  const gt = useGT();
  switch (presence) {
    case "needs_you":
      return <Badge variant="warning">{gt("Needs you")}</Badge>;
    case "working":
      return <Badge variant="info">{gt("Working")}</Badge>;
    case "blocked":
      return <Badge variant="error">{gt("Blocked")}</Badge>;
    case "idle":
      return <Badge variant="secondary">{gt("Idle")}</Badge>;
  }
}

export function BotDetailPage() {
  const gt = useGT();
  const params = useParams({ from: "/_chat/bots_/$projectId" });
  const projectId = ProjectId.make(params.projectId);
  const environmentId = usePrimaryEnvironmentId();
  const overview = useEnvironmentQuery(
    environmentId === null
      ? null
      : botEnvironment.overview({ environmentId, input: { projectId } }),
  );
  const navigate = useNavigate();
  const newThread = useNewThreadHandler();
  const data = overview.data;

  if (environmentId === null) return null;
  if (overview.error !== null) {
    return (
      <WorkspacePageContainer>
        <p className="text-destructive text-sm">{overview.error}</p>
      </WorkspacePageContainer>
    );
  }
  if (data === null) return <WorkspacePageContainer />;

  const startChat = async () => {
    const projectRef = scopeProjectRef(environmentId, projectId);
    await waitForProject(projectRef).catch(() => null);
    await newThread(projectRef);
  };
  const waitingOnYou = data.threads.filter(
    (thread) => thread.presence === "needs_you" || thread.presence === "blocked",
  );

  return (
    <WorkspacePageContainer>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-semibold text-xl">{data.bot.name}</h1>
            <PresenceBadge presence={data.presence} />
          </div>
          <p className="text-muted-foreground text-sm">
            {data.bot.runtime} · {data.bot.model} · <T>Supervised</T>
          </p>
        </div>
        <Button onClick={() => void startChat()}>
          <T>New chat</T>
        </Button>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-base">
          <T>Needs you</T>
        </h2>
        {waitingOnYou.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            <T>Nothing is waiting on you.</T>
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {waitingOnYou.map((thread) => (
              <li key={thread.threadId}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
                  onClick={() =>
                    void navigate({
                      to: "/$environmentId/$threadId",
                      params: { environmentId, threadId: thread.threadId },
                    })
                  }
                >
                  <PresenceBadge presence={thread.presence} />
                  <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
                  {thread.error ? (
                    <span className="truncate text-destructive text-xs">{thread.error}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MemorySection
        environmentId={environmentId}
        projectId={projectId}
        memory={data.memory}
        onChange={overview.refresh}
      />
      <RoutinesSection
        environmentId={environmentId}
        projectId={projectId}
        routines={data.routines}
        onChange={overview.refresh}
      />

      <p className="text-muted-foreground text-xs">
        {gt("{count, plural, =1 {1 open thread} other {{count} open threads}}", {
          count: data.threads.length,
        })}
      </p>
    </WorkspacePageContainer>
  );
}

function MemorySection(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly memory: ReadonlyArray<BotMemoryFile>;
  readonly onChange: () => void;
}) {
  const gt = useGT();
  const writeMemory = useAtomCommand(botEnvironment.writeMemory, { reportFailure: false });
  const deleteMemory = useAtomCommand(botEnvironment.deleteMemory, { reportFailure: false });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newTopic, setNewTopic] = useState("");

  const save = async (name: string, content: string) => {
    const result = await writeMemory({
      environmentId: props.environmentId,
      input: { projectId: props.projectId, name, content },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: gt("Could not save memory"),
            description: failureMessage(result, gt("An error occurred.")),
          }),
        );
      }
      return;
    }
    setDrafts(({ [name]: _saved, ...rest }) => rest);
    props.onChange();
  };

  const remove = async (name: string) => {
    const result = await deleteMemory({
      environmentId: props.environmentId,
      input: { projectId: props.projectId, name },
    });
    if (result._tag === "Success") props.onChange();
  };

  const topicName = `${newTopic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")}.md`;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-base">
          <T>Memory</T>
        </h2>
        <p className="text-muted-foreground text-sm">
          <T>
            What this bot remembers, one file per topic. Only this bot reads it. Edit or delete
            anything; nothing is hidden.
          </T>
        </p>
      </div>
      {props.memory.map((file) => {
        const value = drafts[file.name] ?? file.content;
        const dirty = drafts[file.name] !== undefined && drafts[file.name] !== file.content;
        return (
          <div key={file.name} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm">{file.name}</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!dirty}
                  onClick={() => void save(file.name, value)}
                >
                  <T>Save</T>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(file.name)}>
                  <T>Delete</T>
                </Button>
              </div>
            </div>
            <Textarea
              value={value}
              rows={Math.min(12, Math.max(3, value.split("\n").length))}
              onChange={(event) =>
                setDrafts((current) => ({ ...current, [file.name]: event.target.value }))
              }
            />
          </div>
        );
      })}
      <div className="flex gap-2">
        <Input
          value={newTopic}
          placeholder={gt("New topic, e.g. preferences")}
          onChange={(event) => setNewTopic(event.target.value)}
        />
        <Button
          variant="outline"
          disabled={topicName === ".md" || props.memory.some((file) => file.name === topicName)}
          onClick={() => {
            void save(topicName, "").then(() => setNewTopic(""));
          }}
        >
          <T>Add topic</T>
        </Button>
      </div>
    </section>
  );
}

function RoutinesSection(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly routines: ReadonlyArray<BotRoutine>;
  readonly onChange: () => void;
}) {
  const gt = useGT();
  const createRoutine = useAtomCommand(botEnvironment.createRoutine, { reportFailure: false });
  const setEnabled = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    reportFailure: false,
  });
  const deleteTask = useAtomCommand(serverEnvironment.deleteScheduledTask, {
    reportFailure: false,
  });
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [time, setTime] = useState("09:00");
  const [hours, setHours] = useState(6);
  const [saving, setSaving] = useState(false);

  const rate = runsPerDay(frequency, hours);
  const overCap = rate !== null && rate > MAX_BOT_ROUTINE_RUNS_PER_DAY;
  const frequencyLabel: Record<Frequency, string> = {
    daily: gt("Every day at a time"),
    weekdays: gt("Weekdays at a time"),
    hours: gt("Every few hours"),
    webhook: gt("When an event arrives (webhook)"),
  };

  const create = async () => {
    setSaving(true);
    const result = await createRoutine({
      environmentId: props.environmentId,
      input: {
        projectId: props.projectId,
        title: title.trim(),
        prompt: prompt.trim(),
        schedule: scheduleFor(frequency, time, hours),
      },
    });
    setSaving(false);
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: gt("Could not create the routine"),
            description: failureMessage(result, gt("An error occurred.")),
          }),
        );
      }
      return;
    }
    setTitle("");
    setPrompt("");
    props.onChange();
  };

  const rateLabel = (value: number | null) =>
    value === null
      ? gt("Runs only when an event arrives")
      : gt("About {runs} runs a day", { runs: Number(value.toFixed(value < 1 ? 2 : 0)) });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-base">
          <T>Routines</T>
        </h2>
        <p className="text-muted-foreground text-sm">
          <T>
            Standing work this bot does on its own, always Supervised. Each run costs model usage,
            so the cost is shown before you save and bots allow at most{" "}
            <Var>{MAX_BOT_ROUTINE_RUNS_PER_DAY}</Var> runs a day.
          </T>
        </p>
      </div>
      {props.routines.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {props.routines.map((routine) => (
            <li key={routine.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-sm">{routine.title}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {rateLabel(routine.runsPerDay)} · {routine.lastRunStatus}
                </span>
              </div>
              <Switch
                checked={routine.enabled}
                onCheckedChange={(enabled) =>
                  void setEnabled({
                    environmentId: props.environmentId,
                    input: { id: routine.id, enabled },
                  }).then(props.onChange)
                }
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void deleteTask({
                    environmentId: props.environmentId,
                    input: { id: routine.id },
                  }).then(props.onChange)
                }
              >
                <T>Delete</T>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-col gap-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="routine-title">
            <T>Routine</T>
          </Label>
          <Input
            id="routine-title"
            value={title}
            placeholder={gt("e.g. Morning price check")}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <Textarea
          value={prompt}
          rows={3}
          placeholder={gt("What the bot should do on each run.")}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label>
              <T>When</T>
            </Label>
            <Select
              value={frequency}
              onValueChange={(value) => {
                if (
                  value === "daily" ||
                  value === "weekdays" ||
                  value === "hours" ||
                  value === "webhook"
                )
                  setFrequency(value);
              }}
            >
              <SelectTrigger>
                <SelectValue>{(value: Frequency) => frequencyLabel[value]}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {(Object.keys(frequencyLabel) as Frequency[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {frequencyLabel[value]}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          {frequency === "daily" || frequency === "weekdays" ? (
            <Input
              type="time"
              className="sm:w-32"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          ) : null}
          {frequency === "hours" ? (
            <Input
              type="number"
              min={1}
              className="sm:w-32"
              value={hours}
              onChange={(event) => setHours(Number(event.target.value) || 1)}
            />
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className={overCap ? "text-destructive text-sm" : "text-muted-foreground text-sm"}>
            {rateLabel(rate)}
            {overCap ? ` · ${gt("over the limit")}` : ""}
          </span>
          <Button
            type="submit"
            disabled={saving || overCap || title.trim() === "" || prompt.trim() === ""}
          >
            <T>Create routine</T>
          </Button>
        </div>
      </form>
    </section>
  );
}
