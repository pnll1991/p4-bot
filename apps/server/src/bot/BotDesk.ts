import {
  BotDecision,
  CommandId,
  BotProfile,
  type BotMemoryDeleteInput,
  type BotMemoryFile,
  type BotMemoryWriteInput,
  type BotOverview,
  type BotPresence,
  type BotRoutine,
  type BotRoutineCreateInput,
  type BotArrangeInput,
  type BotPermissionsSetInput,
  type BotRuntimeSetInput,
  type ThreadId,
  type BotRulesSetInput,
  BotMemoryName,
  MAX_BOT_ROUTINE_RUNS_PER_DAY,
  type OrchestrationV2ThreadShell,
  type ProjectId,
  type ScheduledTask,
  type ScheduledTaskSchedule,
  type ScheduledTaskUpsertSchedule,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as ServerConfig from "../config.ts";
import * as ManagedProjectFolders from "../project/ManagedProjectFolders.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as ServerSettingsService from "../serverSettings.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ScheduledTasks from "../scheduledTasks/ScheduledTaskService.ts";
import { BUILT_IN_BOT_RULES } from "./botRules.ts";
import * as BotService from "./BotService.ts";

export class BotNotFoundError extends Schema.TaggedError<BotNotFoundError>()("BotNotFoundError", {
  projectId: Schema.String,
}) {
  override get message(): string {
    return "This project is not a bot.";
  }
}

export class BotOperationError extends Schema.TaggedError<BotOperationError>()(
  "BotOperationError",
  {
    operation: Schema.Literals([
      "read-threads",
      "read-memory",
      "write-memory",
      "routines",
      "rules",
      "permissions",
      "runtime",
      "start-over",
      "delete",
      "arrange",
    ]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Bot operation failed (${this.operation}).`;
  }
}

export class BotRoutineTooFrequentError extends Schema.TaggedError<BotRoutineTooFrequentError>()(
  "BotRoutineTooFrequentError",
  { runsPerDay: Schema.Number },
) {
  override get message(): string {
    return `This routine would run ${Math.round(this.runsPerDay)} times a day. Bots allow at most ${MAX_BOT_ROUTINE_RUNS_PER_DAY}; use a longer interval or an event trigger.`;
  }
}

type BotError = BotNotFoundError | BotOperationError;

/** A Bot's day-to-day surface: presence, threads, memory and routines. Kept apart from BotService, which MCP tools import. */
export class BotDesk extends Context.Service<
  BotDesk,
  {
    /** What the owner needs at a glance: presence, threads, memory and routines. */
    readonly get: (projectId: ProjectId) => Effect.Effect<BotOverview, BotError>;
    readonly writeMemory: (input: BotMemoryWriteInput) => Effect.Effect<void, BotError>;
    readonly deleteMemory: (input: BotMemoryDeleteInput) => Effect.Effect<void, BotError>;
    /** A routine on the Bot's own model, Supervised, capped in runs per day. */
    readonly createRoutine: (
      input: BotRoutineCreateInput,
    ) => Effect.Effect<BotRoutine, BotError | BotRoutineTooFrequentError>;
    /** Replaces the owner's block rules; built-in rules always apply. */
    readonly setRules: (input: BotRulesSetInput) => Effect.Effect<void, BotError>;
    /** Sets how much the bot may do without asking, for its open chat, new chats and routines. */
    readonly setPermissions: (input: BotPermissionsSetInput) => Effect.Effect<void, BotError>;
    /**
     * Swaps the agent behind the bot's own provider instance, keeping its id, so the bot keeps its
     * folder, memory, rules and chats; its chats continue on the new agent through a handoff.
     */
    readonly setRuntime: (input: BotRuntimeSetInput) => Effect.Effect<void, BotError>;
    /**
     * Archives the bot's conversation and unbinds its routines from it, so the next message, the
     * owner's or a routine's, starts the fresh one they all share.
     */
    readonly startOver: (projectId: ProjectId) => Effect.Effect<void, BotError>;
    /**
     * Deletes the bot and everything it brought: routines, its project and conversations, its
     * provider instance and settings, its profile and log, and its folder with memory.
     */
    readonly deleteBot: (projectId: ProjectId) => Effect.Effect<void, BotError>;
    /** Pins, groups or hides the bot in the owner's bot list. */
    readonly arrange: (input: BotArrangeInput) => Effect.Effect<void, BotError>;
  }
>()("t3/bot/BotDesk") {}

const isBotMemoryName = Schema.is(BotMemoryName);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Null when the routine runs only on an event or once, so it has no daily rate. */
const runsPerDay = (
  schedule: ScheduledTaskSchedule | ScheduledTaskUpsertSchedule,
): number | null => {
  switch (schedule.type) {
    case "interval":
      return DAY_MS / schedule.everyMs;
    case "fixed_time":
      return (schedule.weekdays?.length ?? 7) / 7;
    case "once":
    case "webhook":
      return null;
  }
};

const threadPresence = (shell: OrchestrationV2ThreadShell): BotPresence => {
  if (shell.pendingRuntimeRequest !== null) return "needs_you";
  if (shell.activeRunId !== null) return "working";
  if (shell.lastError != null && shell.status === "failed") return "blocked";
  return "idle";
};

const PRESENCE_RANK: Record<BotPresence, number> = {
  needs_you: 3,
  blocked: 2,
  working: 1,
  idle: 0,
};

const toRoutine = (task: ScheduledTask): BotRoutine => ({
  id: task.id,
  title: task.title,
  prompt: task.prompt,
  enabled: task.enabled,
  schedule: task.schedule,
  runsPerDay: runsPerDay(task.schedule),
  lastRunStatus: task.lastRunStatus,
  nextRunAt: task.nextRunAt,
});

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const bots = yield* BotService.BotService;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const engine = yield* Orchestrator.OrchestratorV2;
  const scheduledTasks = yield* ScheduledTasks.ScheduledTaskService;
  const serverSettings = yield* ServerSettingsService.ServerSettingsService;
  const projects = yield* ProjectService.ProjectService;
  const folders = yield* ManagedProjectFolders.ManagedProjectFolders;
  const list = bots.list;
  const botsRoot = path.resolve((yield* ServerConfig.ServerConfig).baseDir, "bots");
  const decodeDecision = Schema.decodeUnknownOption(Schema.fromJsonString(BotDecision));
  const encodeProfile = Schema.encodeEffect(Schema.fromJsonString(BotProfile));

  const readDecisions = (bot: BotProfile) =>
    fileSystem.readFileString(path.join(botsRoot, bot.providerInstanceId, "decisions.jsonl")).pipe(
      Effect.map((text) =>
        text
          .split("\n")
          .filter((line) => line.trim() !== "")
          .slice(-20)
          .reverse()
          .flatMap((line) => {
            const decoded = decodeDecision(line);
            return decoded._tag === "Some" ? [decoded.value] : [];
          }),
      ),
      Effect.orElseSucceed((): ReadonlyArray<BotDecision> => []),
    );

  const findBot = Effect.fn("BotDesk.findBot")(function* (projectId: ProjectId) {
    const bot = (yield* list).find((profile) => profile.projectId === projectId);
    if (bot === undefined) return yield* new BotNotFoundError({ projectId });
    return bot;
  });

  const memoryPath = (bot: BotProfile, name?: string) =>
    name === undefined
      ? path.join(bot.workspaceRoot, "memory")
      : path.join(bot.workspaceRoot, "memory", name);

  const readMemory = Effect.fn("BotDesk.readMemory")(function* (bot: BotProfile) {
    const names = yield* fileSystem
      .readDirectory(memoryPath(bot))
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    const files = yield* Effect.forEach(
      // memory/README.md is the agent's guide to the folder, not a topic.
      names.filter(isBotMemoryName).toSorted(),
      (name) =>
        fileSystem
          .readFileString(memoryPath(bot, name))
          .pipe(Effect.map((content): BotMemoryFile => ({ name, content }))),
    );
    return files;
  });

  // Usage is best effort: a thread whose turns cannot be read counts as idle.
  const usageSince = Effect.fnUntraced(function* (
    threadIds: ReadonlyArray<ThreadId>,
    since: DateTime.Utc,
  ) {
    const usage = { turns: 0, inputTokens: 0, outputTokens: 0 };
    for (const threadId of threadIds) {
      const records = yield* projections
        .getThreadRecords(threadId, ["providerTurns"])
        .pipe(Effect.orElseSucceed(() => ({ providerTurns: [] })));
      for (const turn of records.providerTurns) {
        if (turn.startedAt === null || DateTime.isLessThan(turn.startedAt, since)) continue;
        usage.turns += 1;
        usage.inputTokens += turn.turnTokenUsage?.inputTokens ?? 0;
        usage.outputTokens += turn.turnTokenUsage?.outputTokens ?? 0;
      }
    }
    return usage;
  });

  const get: BotDesk["Service"]["get"] = Effect.fn("BotDesk.get")(function* (projectId) {
    const bot = yield* findBot(projectId);
    const threads = yield* projections.listActiveThreads(projectId).pipe(
      Effect.flatMap((entries) =>
        Effect.forEach(entries, (entry) => projections.getThreadShell(entry.id)),
      ),
      Effect.mapError((cause) => new BotOperationError({ operation: "read-threads", cause })),
    );
    const summaries = threads
      .filter((shell): shell is OrchestrationV2ThreadShell => shell !== null)
      .map((shell) => ({
        threadId: shell.id,
        title: shell.title,
        presence: threadPresence(shell),
        error: shell.lastError ?? null,
      }));
    const memory = yield* readMemory(bot).pipe(
      Effect.mapError((cause) => new BotOperationError({ operation: "read-memory", cause })),
    );
    const tasks = yield* scheduledTasks
      .list()
      .pipe(Effect.mapError((cause) => new BotOperationError({ operation: "routines", cause })));
    const presence = summaries.reduce<BotPresence>(
      (current, thread) =>
        PRESENCE_RANK[thread.presence] > PRESENCE_RANK[current] ? thread.presence : current,
      "idle",
    );
    const usage = yield* usageSince(
      summaries.map((summary) => summary.threadId),
      DateTime.subtract(yield* DateTime.now, { hours: 24 }),
    );
    return {
      bot,
      usage,
      builtInRules: BUILT_IN_BOT_RULES,
      rules: bot.rules ?? [],
      decisions: yield* readDecisions(bot),
      presence,
      threads: summaries,
      memory,
      routines: tasks.tasks.filter((task) => task.projectId === projectId).map(toRoutine),
    };
  });

  const writeMemory: BotDesk["Service"]["writeMemory"] = Effect.fn("BotDesk.writeMemory")(
    function* (input) {
      const bot = yield* findBot(input.projectId);
      yield* fileSystem.makeDirectory(memoryPath(bot), { recursive: true }).pipe(
        Effect.andThen(fileSystem.writeFileString(memoryPath(bot, input.name), input.content)),
        Effect.mapError((cause) => new BotOperationError({ operation: "write-memory", cause })),
      );
    },
  );

  const deleteMemory: BotDesk["Service"]["deleteMemory"] = Effect.fn("BotDesk.deleteMemory")(
    function* (input) {
      const bot = yield* findBot(input.projectId);
      yield* fileSystem
        .remove(memoryPath(bot, input.name))
        .pipe(
          Effect.mapError((cause) => new BotOperationError({ operation: "write-memory", cause })),
        );
    },
  );

  /** A bot is one conversation: its most recently active, unarchived thread. */
  const conversationThreadId = Effect.fnUntraced(function* (projectId: ProjectId) {
    const shells = yield* projections.listActiveThreads(projectId).pipe(
      Effect.flatMap((entries) =>
        Effect.forEach(entries, (entry) => projections.getThreadShell(entry.id)),
      ),
      Effect.orElseSucceed(() => []),
    );
    const newest = shells
      .flatMap((shell): ReadonlyArray<OrchestrationV2ThreadShell> =>
        shell === null ? [] : [shell],
      )
      .toSorted(
        (left, right) =>
          DateTime.toEpochMillis(right.updatedAt) - DateTime.toEpochMillis(left.updatedAt),
      )[0];
    return newest?.id ?? null;
  });

  const createRoutine: BotDesk["Service"]["createRoutine"] = Effect.fn("BotDesk.createRoutine")(
    function* (input) {
      const bot = yield* findBot(input.projectId);
      // Runs post into the bot's conversation; with none yet, the first run starts it.
      const threadId = yield* conversationThreadId(bot.projectId);
      const rate = runsPerDay(input.schedule);
      if (rate !== null && rate > MAX_BOT_ROUTINE_RUNS_PER_DAY) {
        return yield* new BotRoutineTooFrequentError({ runsPerDay: rate });
      }
      const { task } = yield* scheduledTasks
        .upsert({
          title: input.title,
          prompt: input.prompt,
          enabled: true,
          schedule: input.schedule,
          projectId: bot.projectId,
          threadId,
          threadMode: "continue",
          workspaceStrategy: { type: "root" },
          modelSelection: { instanceId: bot.providerInstanceId, model: bot.model },
          // Routines run with the bot's own permissions, Supervised unless the owner chose otherwise.
          runtimeMode: bot.runtimeMode ?? "approval-required",
          interactionMode: "default",
        })
        .pipe(Effect.mapError((cause) => new BotOperationError({ operation: "routines", cause })));
      return toRoutine(task);
    },
  );

  const setRules: BotDesk["Service"]["setRules"] = Effect.fn("BotDesk.setRules")(function* (input) {
    const bot = yield* findBot(input.projectId);
    yield* encodeProfile({ ...bot, rules: input.rules }).pipe(
      Effect.flatMap((json) =>
        fileSystem.writeFileString(
          path.join(botsRoot, bot.providerInstanceId, "bot.json"),
          `${json}\n`,
        ),
      ),
      Effect.mapError((cause) => new BotOperationError({ operation: "rules", cause })),
    );
  });

  const setPermissions: BotDesk["Service"]["setPermissions"] = Effect.fn("BotDesk.setPermissions")(
    function* (input) {
      const bot = yield* findBot(input.projectId);
      yield* encodeProfile({ ...bot, runtimeMode: input.runtimeMode }).pipe(
        Effect.flatMap((json) =>
          fileSystem.writeFileString(
            path.join(botsRoot, bot.providerInstanceId, "bot.json"),
            `${json}\n`,
          ),
        ),
        Effect.mapError((cause) => new BotOperationError({ operation: "permissions", cause })),
      );
      // New chats in the bot's project start from the project's default permissions.
      yield* serverSettings.getSettings.pipe(
        Effect.flatMap((settings) => {
          const { providerInstances: _kept, ...override } =
            settings.projectSettingsOverrides[bot.projectId] ?? {};
          return serverSettings.updateSettings({
            projectSettingsOverrides: {
              [bot.projectId]: { ...override, defaultRuntimeMode: input.runtimeMode },
            },
          });
        }),
        Effect.mapError((cause) => new BotOperationError({ operation: "permissions", cause })),
      );
      // The open chat follows too, so the switch never disagrees with the composer.
      const changedAt = DateTime.toEpochMillis(yield* DateTime.now);
      const threads = yield* projections
        .listActiveThreads(bot.projectId)
        .pipe(
          Effect.mapError((cause) => new BotOperationError({ operation: "permissions", cause })),
        );
      yield* Effect.forEach(threads, (thread) =>
        engine
          .dispatch({
            type: "thread.runtime-mode.set",
            commandId: CommandId.make(`server:bot-permissions:${thread.id}:${changedAt}`),
            threadId: thread.id,
            runtimeMode: input.runtimeMode,
          })
          .pipe(
            Effect.mapError((cause) => new BotOperationError({ operation: "permissions", cause })),
          ),
      );
    },
  );

  const setRuntime: BotDesk["Service"]["setRuntime"] = Effect.fn("BotDesk.setRuntime")(
    function* (input) {
      const bot = yield* findBot(input.projectId);
      const failed = (cause: unknown) => new BotOperationError({ operation: "runtime", cause });
      const next: BotProfile = { ...bot, runtime: input.runtime, model: input.model };
      const modelSelection = { instanceId: bot.providerInstanceId, model: input.model };
      yield* encodeProfile(next).pipe(
        Effect.flatMap((json) =>
          fileSystem.writeFileString(
            path.join(botsRoot, bot.providerInstanceId, "bot.json"),
            `${json}\n`,
          ),
        ),
        Effect.mapError(failed),
      );
      const settings = yield* serverSettings.getSettings.pipe(Effect.mapError(failed));
      const { providerInstances: _kept, ...override } =
        settings.projectSettingsOverrides[bot.projectId] ?? {};
      yield* serverSettings
        .updateProviderInstance(
          {
            operation: "upsert",
            instanceId: bot.providerInstanceId,
            instance: BotService.botProviderInstance(next, botsRoot, path),
          },
          {
            projectSettingsOverrides: {
              [bot.projectId]: { ...override, defaultModelSelection: modelSelection },
            },
          },
        )
        .pipe(Effect.mapError(failed));
      // Its chats name a model of the old agent; their next message hands off to the new one.
      const changedAt = DateTime.toEpochMillis(yield* DateTime.now);
      const threads = yield* projections
        .listActiveThreads(bot.projectId)
        .pipe(Effect.mapError(failed));
      yield* Effect.forEach(threads, (thread) =>
        engine
          .dispatch({
            type: "thread.model-selection.set",
            commandId: CommandId.make(`server:bot-runtime:${thread.id}:${changedAt}`),
            threadId: thread.id,
            modelSelection,
          })
          .pipe(Effect.mapError(failed)),
      );
      // Routines name a model of the old agent; they move to the new one with the bot.
      const { tasks } = yield* scheduledTasks.list().pipe(Effect.mapError(failed));
      yield* Effect.forEach(
        tasks.filter((task) => task.projectId === bot.projectId),
        (task) =>
          scheduledTasks
            .upsert({
              id: task.id,
              requireExisting: true,
              title: task.title,
              prompt: task.prompt,
              enabled: task.enabled,
              schedule: task.schedule as ScheduledTaskUpsertSchedule,
              projectId: task.projectId,
              workspaceStrategy: task.workspaceStrategy,
              modelSelection,
              runtimeMode: task.runtimeMode,
              interactionMode: task.interactionMode,
            })
            .pipe(Effect.mapError(failed)),
      );
    },
  );

  const startOver: BotDesk["Service"]["startOver"] = Effect.fn("BotDesk.startOver")(
    function* (projectId) {
      const bot = yield* findBot(projectId);
      const archivedAt = DateTime.toEpochMillis(yield* DateTime.now);
      const threads = yield* projections
        .listActiveThreads(bot.projectId)
        .pipe(
          Effect.mapError((cause) => new BotOperationError({ operation: "start-over", cause })),
        );
      yield* Effect.forEach(threads, (thread) =>
        engine
          .dispatch({
            type: "thread.archive",
            commandId: CommandId.make(`server:bot-start-over:${thread.id}:${archivedAt}`),
            threadId: thread.id,
          })
          .pipe(
            Effect.mapError((cause) => new BotOperationError({ operation: "start-over", cause })),
          ),
      );
      const { tasks } = yield* scheduledTasks
        .list()
        .pipe(Effect.mapError((cause) => new BotOperationError({ operation: "routines", cause })));
      // Routines follow the bot into its next conversation instead of writing to the archived one.
      yield* Effect.forEach(
        tasks.filter(
          (task) => task.projectId === bot.projectId && task.schedule.type !== "webhook",
        ),
        (task) =>
          scheduledTasks
            .upsert({
              id: task.id,
              requireExisting: true,
              title: task.title,
              prompt: task.prompt,
              enabled: task.enabled,
              schedule: task.schedule as ScheduledTaskUpsertSchedule,
              projectId: task.projectId,
              threadId: null,
              unbindThread: true,
              threadMode: "continue",
              workspaceStrategy: task.workspaceStrategy,
              modelSelection: task.modelSelection,
              runtimeMode: task.runtimeMode,
              interactionMode: task.interactionMode,
            })
            .pipe(
              Effect.mapError((cause) => new BotOperationError({ operation: "routines", cause })),
            ),
      );
    },
  );

  const deleteBot: BotDesk["Service"]["deleteBot"] = Effect.fn("BotDesk.deleteBot")(
    function* (projectId) {
      const bot = yield* findBot(projectId);
      const failed = (cause: unknown) => new BotOperationError({ operation: "delete", cause });
      const { tasks } = yield* scheduledTasks.list().pipe(Effect.mapError(failed));
      yield* Effect.forEach(
        tasks.filter((task) => task.projectId === bot.projectId),
        (task) => scheduledTasks.delete({ id: task.id }).pipe(Effect.mapError(failed)),
      );
      // Deleting the project deletes its threads: the bot's conversation goes with it.
      yield* projects
        .delete({
          commandId: CommandId.make(`server:bot-delete:${bot.projectId}`),
          projectId: bot.projectId,
          force: true,
        })
        .pipe(Effect.mapError(failed));
      yield* serverSettings
        .updateProviderInstance(
          { operation: "remove", instanceId: bot.providerInstanceId },
          { projectSettingsOverrides: { [bot.projectId]: null } },
        )
        .pipe(Effect.mapError(failed));
      yield* fileSystem
        .remove(path.join(botsRoot, bot.providerInstanceId), { recursive: true })
        .pipe(Effect.mapError(failed));
      // Only a folder P4 created for the bot is removed, never a path the profile points elsewhere.
      const workspace = path.resolve(bot.workspaceRoot);
      const managedRoot = path.resolve(folders.namedProjectsRoot);
      if (workspace.startsWith(`${managedRoot}${path.sep}`)) {
        yield* fileSystem.remove(workspace, { recursive: true }).pipe(Effect.mapError(failed));
      }
    },
  );

  const arrange: BotDesk["Service"]["arrange"] = Effect.fn("BotDesk.arrange")(function* (input) {
    const bot = yield* findBot(input.projectId);
    const { projectId: _projectId, ...changes } = input;
    yield* encodeProfile({ ...bot, ...changes }).pipe(
      Effect.flatMap((json) =>
        fileSystem.writeFileString(
          path.join(botsRoot, bot.providerInstanceId, "bot.json"),
          `${json}\n`,
        ),
      ),
      Effect.mapError((cause) => new BotOperationError({ operation: "arrange", cause })),
    );
  });

  return BotDesk.of({
    arrange,
    deleteBot,
    get,
    writeMemory,
    deleteMemory,
    createRoutine,
    setRules,
    setPermissions,
    setRuntime,
    startOver,
  });
});

export const layer = Layer.effect(BotDesk, make);
