import {
  BotDecision,
  BotProfile,
  type BotMemoryDeleteInput,
  type BotMemoryFile,
  type BotMemoryWriteInput,
  type BotOverview,
  type BotPresence,
  type BotRoutine,
  type BotRoutineCreateInput,
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
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as ServerConfig from "../config.ts";
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
  const scheduledTasks = yield* ScheduledTasks.ScheduledTaskService;
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
    return {
      bot,
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

  const createRoutine: BotDesk["Service"]["createRoutine"] = Effect.fn("BotDesk.createRoutine")(
    function* (input) {
      const bot = yield* findBot(input.projectId);
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
          threadId: null,
          workspaceStrategy: { type: "root" },
          modelSelection: { instanceId: bot.providerInstanceId, model: bot.model },
          // Unattended work never runs above Supervised.
          runtimeMode: "approval-required",
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

  return BotDesk.of({ get, writeMemory, deleteMemory, createRoutine, setRules });
});

export const layer = Layer.effect(BotDesk, make);
