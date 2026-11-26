import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  type BotProfile,
  type OrchestrationV2ThreadShell,
  ProjectId,
  ProviderInstanceId,
  ScheduledTaskId,
  type ScheduledTask,
  type ScheduledTaskUpsertInput,
  type ServerSettingsPatch,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import * as ManagedProjectFolders from "../project/ManagedProjectFolders.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as ServerSettingsService from "../serverSettings.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ScheduledTasks from "../scheduledTasks/ScheduledTaskService.ts";
import * as BotDesk from "./BotDesk.ts";
import * as BotService from "./BotService.ts";

const projectId = ProjectId.make("project-bot");
const waiting = ThreadId.make("thread-waiting");
const quiet = ThreadId.make("thread-quiet");

const shell = (id: ThreadId, waitsOnOwner: boolean) =>
  ({
    id,
    title: waitsOnOwner ? "Compra pendiente" : "Resumen diario",
    activeRunId: null,
    status: "idle",
    // The waiting thread is the newer one, so it is the bot's conversation.
    updatedAt: DateTime.makeUnsafe(
      waitsOnOwner ? "2026-11-26T12:00:00.000Z" : "2026-11-25T12:00:00.000Z",
    ),
    lastError: null,
    pendingRuntimeRequest: waitsOnOwner
      ? { id: "request-1", kind: "approval", createdAt: "2026-11-26T12:00:00.000Z" }
      : null,
  }) as unknown as OrchestrationV2ThreadShell;

const harness = (
  workspaceRoot: string,
  upserts: Array<ScheduledTaskUpsertInput>,
  settingsPatches: Array<ServerSettingsPatch> = [],
  calls: Array<string> = [],
  namedProjectsRoot = "/nowhere",
) => {
  const bot: BotProfile = {
    version: 1,
    name: "Comprador",
    persona: "Compra con aprobación.",
    runtime: "pi",
    model: "maya/inkling-2-mini",
    projectId,
    workspaceRoot,
    providerInstanceId: ProviderInstanceId.make("bot-test"),
  };
  return BotDesk.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        // Like the real service, the list reads each profile from disk on every call.
        Layer.unwrap(
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;
            return Layer.mock(BotService.BotService)({
              list: fileSystem.readFileString(`${workspaceRoot}/bots/bot-test/bot.json`).pipe(
                Effect.map((json) => [JSON.parse(json) as BotProfile]),
                Effect.orElseSucceed(() => [bot]),
              ),
            });
          }),
        ),
        Layer.mock(ProjectService.ProjectService)({
          delete: (input) => {
            calls.push(`project.delete:${input.projectId}:${String(input.force)}`);
            return Effect.succeed({} as never);
          },
        }),
        Layer.mock(ManagedProjectFolders.ManagedProjectFolders)({ namedProjectsRoot }),
        Layer.mock(Orchestrator.OrchestratorV2)({
          dispatch: (command) => {
            calls.push(
              command.type === "thread.model-selection.set"
                ? `thread.model:${command.threadId}:${command.modelSelection.model}`
                : command.type === "thread.runtime-mode.set"
                  ? `thread.mode:${command.threadId}:${command.runtimeMode}`
                  : command.type === "thread.archive"
                    ? `thread.archive:${command.threadId}`
                    : command.type,
            );
            return Effect.succeed({} as never);
          },
        }),
        Layer.mock(ServerSettingsService.ServerSettingsService)({
          updateProviderInstance: (mutation, patch) => {
            calls.push(
              mutation.operation === "remove"
                ? `provider.remove:${mutation.instanceId}`
                : `provider.${mutation.operation}:${mutation.instanceId}:${mutation.instance.driver}:${JSON.stringify(mutation.instance.config)}`,
            );
            if (patch) settingsPatches.push(patch);
            return Effect.succeed({} as never);
          },
          getSettings: Effect.succeed({
            projectSettingsOverrides: {
              [projectId]: {
                defaultRuntimeMode: "approval-required",
                providerInstances: { "bot-test": { enabled: true } },
              },
            },
          } as never),
          updateSettings: (patch) => {
            settingsPatches.push(patch);
            return Effect.succeed({} as never);
          },
        }),
        ServerConfig.layerTest(workspaceRoot, workspaceRoot),
        Layer.mock(ProjectionStore.ProjectionStoreV2)({
          listActiveThreads: () => Effect.succeed([{ id: waiting }, { id: quiet }] as never),
          getThreadShell: (threadId) => Effect.succeed(shell(threadId, threadId === waiting)),
          getThreadRecords: (threadId) =>
            Effect.succeed({
              providerTurns:
                threadId === waiting
                  ? [
                      {
                        startedAt: DateTime.makeUnsafe("1969-12-31T12:00:00.000Z"),
                        turnTokenUsage: { inputTokens: 120, outputTokens: 30 },
                      },
                      { startedAt: DateTime.makeUnsafe("1969-12-29T00:00:00.000Z") },
                    ]
                  : [],
            } as never),
        }),
        Layer.mock(ScheduledTasks.ScheduledTaskService)({
          list: () =>
            Effect.succeed({
              tasks: [
                {
                  id: "task-bot",
                  projectId,
                  title: "Precios",
                  enabled: true,
                  schedule: { type: "fixed_time", timeOfDay: "09:00" },
                  lastRunStatus: "never",
                  nextRunAt: null,
                } as unknown as ScheduledTask,
              ],
            }),
          delete: (input) => {
            calls.push(`task.delete:${input.id}`);
            return Effect.succeed({} as never);
          },
          upsert: (input) => {
            upserts.push(input);
            return Effect.succeed({
              task: {
                ...input,
                id: "task-1",
                nextRunAt: null,
                lastRunStatus: "never",
              } as unknown as ScheduledTask,
            });
          },
        }),
      ),
    ),
  );
};

it.layer(NodeServices.layer)("BotDesk", (it) => {
  it.effect("shows what needs the owner, keeps memory editable, and caps routine cost", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "p4-bot-desk-" });
      const upserts: Array<ScheduledTaskUpsertInput> = [];

      yield* Effect.gen(function* () {
        const desk = yield* BotDesk.BotDesk;

        yield* desk.writeMemory({ projectId, name: "preferencias.md", content: "Talle M." });
        const overview = yield* desk.get(projectId);
        assert.equal(overview.presence, "needs_you");
        // Only turns from the last day count; the test clock starts at the epoch.
        assert.deepEqual(overview.usage, { turns: 1, inputTokens: 120, outputTokens: 30 });
        assert.deepEqual(
          overview.threads.map((thread) => thread.presence),
          ["needs_you", "idle"],
        );
        assert.deepEqual(overview.memory, [{ name: "preferencias.md", content: "Talle M." }]);
        assert.isTrue(
          yield* fileSystem.exists(path.join(workspaceRoot, "memory", "preferencias.md")),
        );

        yield* desk.deleteMemory({ projectId, name: "preferencias.md" });
        assert.deepEqual((yield* desk.get(projectId)).memory, []);

        const routine = yield* desk.createRoutine({
          projectId,
          title: "Precios del día",
          prompt: "Revisá los precios.",
          schedule: { type: "fixed_time", timeOfDay: "09:00" },
        });
        assert.equal(routine.runsPerDay, 1);
        assert.equal(upserts[0]?.runtimeMode, "approval-required");
        // Routine runs post into the bot's one conversation.
        assert.equal(upserts[0]?.threadId, waiting);
        assert.equal(upserts[0]?.threadMode, "continue");
        assert.deepEqual(upserts[0]?.modelSelection, {
          instanceId: ProviderInstanceId.make("bot-test"),
          model: "maya/inkling-2-mini",
        });

        const tooOften = yield* Effect.flip(
          desk.createRoutine({
            projectId,
            title: "Cada 15 minutos",
            prompt: "Revisá.",
            schedule: { type: "interval", everyMs: 15 * 60 * 1000 },
          }),
        );
        assert.equal(tooOften._tag, "BotRoutineTooFrequentError");
        assert.lengthOf(upserts, 1);

        const unknown = yield* Effect.flip(desk.get(ProjectId.make("not-a-bot")));
        assert.equal(unknown._tag, "BotNotFoundError");
      }).pipe(Effect.provide(harness(workspaceRoot, upserts)));
    }).pipe(Effect.scoped),
  );

  it.effect(
    "full access applies to open chats, new chats and routines, keeping the provider override",
    () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "p4-bot-perm-" });
        yield* fileSystem.makeDirectory(`${workspaceRoot}/bots/bot-test`, { recursive: true });
        const upserts: Array<ScheduledTaskUpsertInput> = [];
        const patches: Array<ServerSettingsPatch> = [];
        const calls: Array<string> = [];

        yield* Effect.gen(function* () {
          const desk = yield* BotDesk.BotDesk;
          yield* desk.setPermissions({ projectId, runtimeMode: "full-access" });
        }).pipe(Effect.provide(harness(workspaceRoot, upserts, patches, calls)));

        assert.deepEqual(calls, [
          `thread.mode:${waiting}:full-access`,
          `thread.mode:${quiet}:full-access`,
        ]);

        assert.deepEqual(patches, [
          { projectSettingsOverrides: { [projectId]: { defaultRuntimeMode: "full-access" } } },
        ]);
        const saved = JSON.parse(
          yield* fileSystem.readFileString(`${workspaceRoot}/bots/bot-test/bot.json`),
        ) as { runtimeMode?: string };
        assert.equal(saved.runtimeMode, "full-access");
      }).pipe(Effect.scoped),
  );

  it.effect("changing the agent keeps the bot's instance and moves its chats and routines", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "p4-bot-runtime-",
      });
      yield* fileSystem.makeDirectory(`${workspaceRoot}/bots/bot-test`, { recursive: true });
      const upserts: Array<ScheduledTaskUpsertInput> = [];
      const patches: Array<ServerSettingsPatch> = [];
      const calls: Array<string> = [];

      yield* Effect.gen(function* () {
        const desk = yield* BotDesk.BotDesk;
        yield* desk.setRuntime({ projectId, runtime: "claudeAgent", model: "claude-sonnet-5-5" });
      }).pipe(Effect.provide(harness(workspaceRoot, upserts, patches, calls)));

      const selection = {
        instanceId: ProviderInstanceId.make("bot-test"),
        model: "claude-sonnet-5-5",
      };
      assert.deepEqual(calls, [
        `provider.upsert:bot-test:claudeAgent:${JSON.stringify({
          homePath: `${workspaceRoot}/bots/bot-test/provider-home`,
        })}`,
        `thread.model:${waiting}:claude-sonnet-5-5`,
        `thread.model:${quiet}:claude-sonnet-5-5`,
      ]);
      // The override that turns the bot's instance on is left alone.
      assert.deepEqual(patches, [
        {
          projectSettingsOverrides: {
            [projectId]: {
              defaultRuntimeMode: "approval-required",
              defaultModelSelection: selection,
            },
          },
        },
      ]);
      assert.deepEqual(
        upserts.map((upsert) => ({
          id: upsert.id,
          model: upsert.modelSelection,
          thread: upsert.threadId,
        })),
        [{ id: ScheduledTaskId.make("task-bot"), model: selection, thread: undefined }],
      );
      const saved = JSON.parse(
        yield* fileSystem.readFileString(`${workspaceRoot}/bots/bot-test/bot.json`),
      ) as { runtime: string; model: string; providerInstanceId: string };
      assert.equal(saved.runtime, "claudeAgent");
      assert.equal(saved.model, "claude-sonnet-5-5");
      assert.equal(saved.providerInstanceId, "bot-test");
    }).pipe(Effect.scoped),
  );

  it.effect("starting over archives the bot's chats and moves its routines to the next one", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "p4-bot-over-" });
      const upserts: Array<ScheduledTaskUpsertInput> = [];
      const calls: Array<string> = [];

      yield* Effect.gen(function* () {
        const desk = yield* BotDesk.BotDesk;
        yield* desk.startOver(projectId);
      }).pipe(Effect.provide(harness(workspaceRoot, upserts, [], calls)));

      assert.deepEqual(calls, [`thread.archive:${waiting}`, `thread.archive:${quiet}`]);
      assert.deepEqual(
        upserts.map((upsert) => ({ id: upsert.id, unbind: upsert.unbindThread })),
        [{ id: ScheduledTaskId.make("task-bot"), unbind: true }],
      );
    }).pipe(Effect.scoped),
  );

  it.effect("deleting a bot removes its routines, project, provider and files", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "p4-bot-delete-" });
      const projectsRoot = path.join(root, "projects");
      const workspace = path.join(projectsRoot, "comprador");
      yield* fileSystem.makeDirectory(path.join(workspace, "memory"), { recursive: true });
      yield* fileSystem.writeFileString(path.join(workspace, "memory", "talle.md"), "M");
      yield* fileSystem.makeDirectory(path.join(workspace, "bots", "bot-test"), {
        recursive: true,
      });
      const calls: Array<string> = [];
      const patches: Array<ServerSettingsPatch> = [];

      yield* Effect.gen(function* () {
        const desk = yield* BotDesk.BotDesk;
        yield* desk.deleteBot(projectId);
      }).pipe(Effect.provide(harness(workspace, [], patches, calls, projectsRoot)));

      assert.deepEqual(calls, [
        "task.delete:task-bot",
        `project.delete:${projectId}:true`,
        "provider.remove:bot-test",
      ]);
      assert.deepEqual(patches, [{ projectSettingsOverrides: { [projectId]: null } }]);
      // The bot's folder, with its memory, is gone; the managed root stays.
      assert.isFalse(yield* fileSystem.exists(workspace));
      assert.isTrue(yield* fileSystem.exists(projectsRoot));
    }).pipe(Effect.scoped),
  );

  it.effect("arranging a bot keeps its group, pin and visibility, even beside other changes", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "p4-bot-arrange-",
      });
      yield* fileSystem.makeDirectory(`${workspaceRoot}/bots/bot-test`, { recursive: true });

      yield* Effect.gen(function* () {
        const desk = yield* BotDesk.BotDesk;
        yield* desk.arrange({ projectId, group: "Marketing", pinned: true });
        // Changes that land together each keep the other's: none rewrites a stale profile.
        yield* Effect.all(
          [
            desk.arrange({ projectId, hidden: true }),
            desk.setRules({ projectId, rules: [{ pattern: "mercadopago.com" }] }),
            desk.setPermissions({ projectId, runtimeMode: "full-access" }),
          ],
          { concurrency: "unbounded" },
        );
      }).pipe(Effect.provide(harness(workspaceRoot, [])));

      const saved = JSON.parse(
        yield* fileSystem.readFileString(`${workspaceRoot}/bots/bot-test/bot.json`),
      ) as BotProfile;
      assert.equal(saved.group, "Marketing");
      assert.equal(saved.pinned, true);
      assert.equal(saved.hidden, true);
      assert.deepEqual(saved.rules, [{ pattern: "mercadopago.com" }]);
      assert.equal(saved.runtimeMode, "full-access");
      assert.equal(saved.name, "Comprador");
    }).pipe(Effect.scoped),
  );
});
