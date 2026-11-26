import type {
  BotRoutine,
  EnvironmentId,
  ProjectId,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { CalendarClockIcon, SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";

import { botEnvironment } from "../../state/bots";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { BotAvatar } from "./BotAvatar";
import { openBotSettings } from "./BotDialogs";
import { formatRosterTime } from "./useBotRoster";

const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact" });

/**
 * The bot's side card, kept as plain as a contact sheet: who it is, what it does on its own,
 * whether it may act without asking, and what it used today. Everything else lives in settings.
 */
export function BotThreadDetails({
  environmentId,
  projectId,
  threadId = null,
  runtimeMode,
  onRuntimeModeChange,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly threadId?: ThreadId | null;
  /** The open chat's mode; the switch follows it so it always matches the composer. */
  readonly runtimeMode?: RuntimeMode;
  readonly onRuntimeModeChange?: (mode: RuntimeMode) => void;
}) {
  const gt = useGT();
  const overview = useEnvironmentQuery(
    botEnvironment.overview({ environmentId, input: { projectId } }),
  );
  const setRoutineEnabled = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    reportFailure: false,
  });
  const setPermissions = useAtomCommand(botEnvironment.setPermissions, { reportFailure: false });
  const setThreadMode = useAtomCommand(threadEnvironment.setRuntimeMode, { reportFailure: false });
  const data = overview.data;
  if (data === null) return null;
  const usage = data.usage ?? { turns: 0, inputTokens: 0, outputTokens: 0 };
  // Some runtimes (Pi) report no token counts; a dash says "unknown", not "none".
  const tokensKnown = usage.turns === 0 || usage.inputTokens + usage.outputTokens > 0;
  const fullAccess = (runtimeMode ?? data.bot.runtimeMode) === "full-access";

  // One switch for both: the open chat changes now, and the bot keeps it for later chats and routines.
  const toggleFullAccess = async (on: boolean) => {
    const mode = on ? "full-access" : "approval-required";
    onRuntimeModeChange?.(mode);
    const result = await setPermissions({ environmentId, input: { projectId, runtimeMode: mode } });
    if (result._tag === "Success" && threadId !== null && onRuntimeModeChange === undefined) {
      await setThreadMode({ environmentId, input: { threadId, runtimeMode: mode } });
    }
    overview.refresh();
  };

  return (
    <div className="flex flex-col gap-4 px-2 py-3">
      <div className="flex flex-col items-center gap-2 text-center">
        <BotAvatar seed={data.bot.providerInstanceId} name={data.bot.name} className="size-16" />
        <h2 className="font-semibold text-base">{data.bot.name}</h2>
      </div>

      <Group title={gt("Routines")}>
        {data.routines.length === 0 ? (
          <p className="px-3 py-2.5 text-muted-foreground text-xs">
            <T>Nothing scheduled. Ask the bot to do something every day.</T>
          </p>
        ) : (
          data.routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              onToggle={(enabled) =>
                void setRoutineEnabled({
                  environmentId,
                  input: { id: routine.id, enabled },
                }).then(overview.refresh)
              }
            />
          ))
        )}
      </Group>

      <Group title={gt("Access")}>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm">
              <T>Full access</T>
            </span>
            <span className="text-muted-foreground text-xs">
              {fullAccess ? <T>Acts without asking</T> : <T>Asks before commands and edits</T>}
            </span>
          </span>
          <Switch
            checked={fullAccess}
            onCheckedChange={(on) => void toggleFullAccess(on)}
            aria-label={gt("Full access")}
          />
        </div>
      </Group>

      <Group title={gt("Last 24 hours")}>
        <dl className="grid grid-cols-3 gap-2 px-3 py-2.5">
          <Figure label={gt("Turns")} value={usage.turns} />
          <Figure label={gt("Tokens in")} value={tokensKnown ? usage.inputTokens : null} />
          <Figure label={gt("Tokens out")} value={tokensKnown ? usage.outputTokens : null} />
        </dl>
      </Group>

      <Button
        variant="outline"
        size="sm"
        onClick={() => openBotSettings({ environmentId, projectId, threadId })}
      >
        <SettingsIcon />
        <T>Bot settings</T>
      </Button>
    </div>
  );
}

function Group({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1 text-muted-foreground text-xs">{title}</h3>
      <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
        {children}
      </div>
    </section>
  );
}

function RoutineCard({
  routine,
  onToggle,
}: {
  readonly routine: BotRoutine;
  readonly onToggle: (enabled: boolean) => void;
}) {
  const gt = useGT();
  const when = !routine.enabled
    ? gt("Paused")
    : routine.nextRunAt
      ? gt("Next {time}", { time: formatRosterTime(routine.nextRunAt) })
      : gt("Not scheduled");
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <CalendarClockIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{routine.title}</span>
        <span className="text-muted-foreground text-xs">{when}</span>
      </span>
      <Switch
        checked={routine.enabled}
        onCheckedChange={onToggle}
        aria-label={gt("Run {title}", { title: routine.title })}
      />
    </div>
  );
}

function Figure({ label, value }: { readonly label: string; readonly value: number | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium text-sm tabular-nums">
        {value === null ? "-" : compactNumber.format(value)}
      </dd>
    </div>
  );
}
