import * as Schema from "effect/Schema";

import {
  ForwardCompatibleArray,
  ProjectId,
  ScheduledTaskId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";
import { ProviderRequestKind } from "./providerPolicy.ts";
import {
  ScheduledTaskRunStatus,
  ScheduledTaskSchedule,
  ScheduledTaskUpsertSchedule,
} from "./scheduledTask.ts";

/** codex and claudeAgent get a home only this Bot uses; pi shares the machine's Pi models, local ones included. */
export const BotRuntime = Schema.Literals(["pi", "codex", "claudeAgent"]);
export type BotRuntime = typeof BotRuntime.Type;

/** Blocks any action whose request text contains `pattern` (case-insensitive), optionally of some kinds only. */
export const BotRule = Schema.Struct({
  pattern: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
  kinds: Schema.optionalKey(Schema.Array(ProviderRequestKind)),
  label: Schema.optionalKey(Schema.String),
});
export type BotRule = typeof BotRule.Type;

export const BotRuntimeMode = Schema.Literals(["approval-required", "full-access"]);
export type BotRuntimeMode = typeof BotRuntimeMode.Type;

export const BotProfile = Schema.Struct({
  version: Schema.Literal(1),
  name: Schema.String,
  persona: Schema.String,
  runtime: BotRuntime,
  model: Schema.String,
  projectId: ProjectId,
  workspaceRoot: Schema.String,
  providerInstanceId: ProviderInstanceId,
  /** The owner's own block rules, on top of the built-in ones. */
  rules: Schema.optionalKey(Schema.Array(BotRule)),
  /** Supervised asks before acting; full access never asks. Absent means Supervised. */
  runtimeMode: Schema.optionalKey(BotRuntimeMode),
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

/** What the Bot's guard did with one action request: blocked by a rule, or left to the owner. */
export const BotDecision = Schema.Struct({
  at: Schema.String,
  threadId: ThreadId,
  requestId: Schema.String,
  kind: Schema.String,
  summary: Schema.String,
  outcome: Schema.Literals(["blocked", "asked"]),
  rule: Schema.NullOr(Schema.String),
});
export type BotDecision = typeof BotDecision.Type;

export const BotUsage = Schema.Struct({
  turns: Schema.Int,
  inputTokens: Schema.Int,
  outputTokens: Schema.Int,
});
export type BotUsage = typeof BotUsage.Type;

export const BotOverview = Schema.Struct({
  bot: BotProfile,
  presence: BotPresence,
  threads: ForwardCompatibleArray(BotThreadSummary),
  memory: ForwardCompatibleArray(BotMemoryFile),
  routines: ForwardCompatibleArray(BotRoutine),
  builtInRules: ForwardCompatibleArray(BotRule),
  rules: ForwardCompatibleArray(BotRule),
  /** Newest first. */
  decisions: ForwardCompatibleArray(BotDecision),
  /** What the bot used over the last 24 hours, across its chats and routines. */
  usage: Schema.optionalKey(BotUsage),
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

export const BotRulesSetInput = Schema.Struct({
  projectId: ProjectId,
  rules: Schema.Array(BotRule).check(Schema.isMaxLength(100)),
});
export type BotRulesSetInput = typeof BotRulesSetInput.Type;

export const BotPermissionsSetInput = Schema.Struct({
  projectId: ProjectId,
  runtimeMode: BotRuntimeMode,
});
export type BotPermissionsSetInput = typeof BotPermissionsSetInput.Type;
