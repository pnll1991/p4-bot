import * as Schema from "effect/Schema";

import {
  ForwardCompatibleArray,
  ProjectId,
  ScheduledTaskId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";
import {
  ScheduledTaskRunStatus,
  ScheduledTaskSchedule,
  ScheduledTaskUpsertSchedule,
} from "./scheduledTask.ts";

/** codex and claudeAgent get a home only this Bot uses; pi shares the machine's Pi models, local ones included. */
export const BotRuntime = Schema.Literals(["pi", "codex", "claudeAgent"]);
export type BotRuntime = typeof BotRuntime.Type;

export const BotProfile = Schema.Struct({
  version: Schema.Literal(1),
  name: Schema.String,
  persona: Schema.String,
  runtime: BotRuntime,
  model: Schema.String,
  projectId: ProjectId,
  workspaceRoot: Schema.String,
  providerInstanceId: ProviderInstanceId,
});
export type BotProfile = typeof BotProfile.Type;

export const BotCreateInput = Schema.Struct({
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
  persona: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
  runtime: BotRuntime,
  model: TrimmedNonEmptyString,
});
export type BotCreateInput = typeof BotCreateInput.Type;

export const BotListInput = Schema.Struct({});
export type BotListInput = typeof BotListInput.Type;

export const BotListResult = Schema.Struct({
  bots: ForwardCompatibleArray(BotProfile),
});
export type BotListResult = typeof BotListResult.Type;

/** Routines run unattended, so their cost is capped: at most this many runs a day. */
export const MAX_BOT_ROUTINE_RUNS_PER_DAY = 48;

/** needs_you: a thread waits on an approval or answer only the owner can give. */
export const BotPresence = Schema.Literals(["idle", "working", "needs_you", "blocked"]);
export type BotPresence = typeof BotPresence.Type;

export const BotThreadSummary = Schema.Struct({
  threadId: ThreadId,
  title: Schema.String,
  presence: BotPresence,
  error: Schema.NullOr(Schema.String),
});
export type BotThreadSummary = typeof BotThreadSummary.Type;

/** One topic of the Bot's memory: a Markdown file in its workspace's memory/ folder. */
export const BotMemoryName = TrimmedNonEmptyString.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9_-]{0,63}\.md$/),
);
export type BotMemoryName = typeof BotMemoryName.Type;

export const BotMemoryFile = Schema.Struct({
  name: BotMemoryName,
  content: Schema.String,
});
export type BotMemoryFile = typeof BotMemoryFile.Type;

export const BotRoutine = Schema.Struct({
  id: ScheduledTaskId,
  title: Schema.String,
  prompt: Schema.String,
  enabled: Schema.Boolean,
  schedule: ScheduledTaskSchedule,
  /** Null for event-triggered routines, which run only when something happens. */
  runsPerDay: Schema.NullOr(Schema.Number),
  lastRunStatus: ScheduledTaskRunStatus,
  nextRunAt: Schema.NullOr(Schema.String),
});
export type BotRoutine = typeof BotRoutine.Type;

export const BotOverview = Schema.Struct({
  bot: BotProfile,
  presence: BotPresence,
  threads: ForwardCompatibleArray(BotThreadSummary),
  memory: ForwardCompatibleArray(BotMemoryFile),
  routines: ForwardCompatibleArray(BotRoutine),
});
export type BotOverview = typeof BotOverview.Type;

export const BotGetInput = Schema.Struct({ projectId: ProjectId });
export type BotGetInput = typeof BotGetInput.Type;

export const BotMemoryWriteInput = Schema.Struct({
  projectId: ProjectId,
  name: BotMemoryName,
  content: Schema.String.check(Schema.isMaxLength(100_000)),
});
export type BotMemoryWriteInput = typeof BotMemoryWriteInput.Type;

export const BotMemoryDeleteInput = Schema.Struct({ projectId: ProjectId, name: BotMemoryName });
export type BotMemoryDeleteInput = typeof BotMemoryDeleteInput.Type;

export const BotRoutineCreateInput = Schema.Struct({
  projectId: ProjectId,
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
  prompt: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
  schedule: ScheduledTaskUpsertSchedule,
});
export type BotRoutineCreateInput = typeof BotRoutineCreateInput.Type;
