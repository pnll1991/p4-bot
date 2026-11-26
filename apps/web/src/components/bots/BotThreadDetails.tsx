import type { BotRoutine, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { CalendarClockIcon } from "lucide-react";

import { botEnvironment } from "../../state/bots";
import { useEnvironmentQuery } from "../../state/query";
import { ThreadDetailsSection } from "../chat/ThreadDetailsSection";
import { formatRosterTime } from "./useBotRoster";

const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact" });

/** What a bot thread's details card shows instead of folders and git: its routines and usage. */
export function BotThreadDetails({
  environmentId,
  projectId,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}) {
  const gt = useGT();
  const overview = useEnvironmentQuery(
    botEnvironment.overview({ environmentId, input: { projectId } }),
  );
  const data = overview.data;
  if (data === null) return null;
  const usage = data.usage ?? { turns: 0, inputTokens: 0, outputTokens: 0 };
  const tokensKnown = usage.turns === 0 || usage.inputTokens + usage.outputTokens > 0;

  return (
    <div className="flex flex-col">
      <ThreadDetailsSection
        headingId="bot-details-routines-heading"
        title={gt("Routines")}
        separated={false}
      >
        {data.routines.length === 0 ? (
          <p className="px-2 py-1.5 text-muted-foreground text-xs">
            <T>No routines yet. Add one from the bot's details.</T>
          </p>
        ) : (
          <ul className="flex flex-col">
            {data.routines.map((routine) => (
              <RoutineRow key={routine.id} routine={routine} />
            ))}
          </ul>
        )}
      </ThreadDetailsSection>
      <ThreadDetailsSection headingId="bot-details-usage-heading" title={gt("Last 24 hours")}>
        <dl className="grid grid-cols-3 gap-2 px-2 py-1.5">
          <UsageFigure label={gt("Turns")} value={usage.turns} />
          {/* Some runtimes (Pi) report no token counts; a dash says "unknown", not "none". */}
          <UsageFigure label={gt("Tokens in")} value={tokensKnown ? usage.inputTokens : null} />
          <UsageFigure label={gt("Tokens out")} value={tokensKnown ? usage.outputTokens : null} />
        </dl>
      </ThreadDetailsSection>
    </div>
  );
}

function RoutineRow({ routine }: { readonly routine: BotRoutine }) {
  const gt = useGT();
  const when = !routine.enabled
    ? gt("Paused")
    : routine.nextRunAt
      ? gt("Next {time}", { time: formatRosterTime(routine.nextRunAt) })
      : gt("Not scheduled");
  return (
    <li className="flex list-none items-center gap-2.5 rounded-md px-2 py-1.5 text-sm">
      <CalendarClockIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{routine.title}</span>
      <span className="shrink-0 text-muted-foreground text-xs">{when}</span>
    </li>
  );
}

function UsageFigure({ label, value }: { readonly label: string; readonly value: number | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium text-sm tabular-nums">
        {value === null ? "-" : compactNumber.format(value)}
      </dd>
    </div>
  );
}
