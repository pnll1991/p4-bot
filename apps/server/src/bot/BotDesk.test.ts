import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  type BotProfile,
  type OrchestrationV2ThreadShell,
  ProjectId,
  ProviderInstanceId,
  type ScheduledTask,
  type ScheduledTaskUpsertInput,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

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
    lastError: null,
    pendingRuntimeRequest: waitsOnOwner
      ? { id: "request-1", kind: "approval", createdAt: "2026-11-26T12:00:00.000Z" }
      : null,
  }) as unknown as OrchestrationV2ThreadShell;

const harness = (workspaceRoot: string, upserts: Array<ScheduledTaskUpsertInput>) => {
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
        Layer.mock(BotService.BotService)({ list: Effect.succeed([bot]) }),
        Layer.mock(ProjectionStore.ProjectionStoreV2)({
          listActiveThreads: () => Effect.succeed([{ id: waiting }, { id: quiet }] as never),
          getThreadShell: (threadId) => Effect.succeed(shell(threadId, threadId === waiting)),
        }),
        Layer.mock(ScheduledTasks.ScheduledTaskService)({
          list: () => Effect.succeed({ tasks: [] }),
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
});
