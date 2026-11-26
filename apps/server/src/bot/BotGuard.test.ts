import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  type BotProfile,
  type OrchestrationV2DomainEvent,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as BotGuard from "./BotGuard.ts";
import * as BotService from "./BotService.ts";

const projectId = ProjectId.make("project-bot");
const threadId = ThreadId.make("thread-bot");
const instanceId = ProviderInstanceId.make("bot-guard");

const prompts: Record<string, string> = {
  "request-sudo": '{ "command": "sudo -n apt install nginx" }',
  "request-ls": '{ "command": "ls -la" }',
  "request-pay": "Open https://www.mercadopago.com/checkout",
};

const approvalEvent = (requestId: string, requestKind = "command", type = "approval_request") =>
  ({
    type: "turn-item.updated",
    threadId,
    payload: {
      type,
      status: "waiting",
      requestId,
      requestKind,
      title: "Allow bash?",
      prompt: prompts[requestId],
    },
  }) as unknown as OrchestrationV2DomainEvent;

const harness = (baseDir: string, dispatched: Array<unknown>) => {
  const bot: BotProfile = {
    version: 1,
    name: "Guarded",
    persona: "x",
    runtime: "pi",
    model: "m",
    projectId,
    workspaceRoot: baseDir,
    providerInstanceId: instanceId,
    rules: [{ pattern: "mercadopago.com", label: "No payments site" }],
  };
  return BotGuard.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(Orchestrator.OrchestratorV2)({
          dispatch: (command) => {
            dispatched.push(command);
            return Effect.succeed({ sequence: 1 }) as never;
          },
        }),
        Layer.mock(ProjectionStore.ProjectionStoreV2)({
          getThread: () => Effect.succeed({ id: threadId, projectId } as never),
          getRuntimeRequest: (_threadId, requestId) =>
            Effect.succeed({
              id: requestId,
              responseCapability:
                requestId === "request-sudo"
                  ? { type: "live", supportsFeedback: true }
                  : { type: "message" },
            } as never),
        }),
        Layer.mock(BotService.BotService)({ list: Effect.succeed([bot]) }),
        ServerConfig.layerTest(baseDir, baseDir),
      ),
    ),
  );
};

it.layer(NodeServices.layer)("BotGuard", (it) => {
  it.effect("declines what a rule blocks, leaves the rest to the owner, and logs both", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const baseDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "p4-bot-guard-" });
      yield* fileSystem.makeDirectory(path.join(baseDir, "bots", instanceId), { recursive: true });
      const dispatched: Array<{
        readonly type: string;
        readonly decision?: string;
        readonly feedback?: string;
      }> = [];

      yield* Effect.gen(function* () {
        const guard = yield* BotGuard.BotGuard;
        yield* guard.handle(approvalEvent("request-sudo"));
        yield* guard.handle(approvalEvent("request-ls"));
        yield* guard.handle(approvalEvent("request-pay", "permission"));
        // A repeated waiting item and questions are none of the guard's business.
        yield* guard.handle(approvalEvent("request-sudo"));
        yield* guard.handle(approvalEvent("request-other", "command", "user_input_request"));
      }).pipe(Effect.provide(harness(baseDir, dispatched)));

      assert.deepEqual(
        dispatched.map((command) => [
          command.type,
          command.decision,
          command.feedback !== undefined,
        ]),
        [
          // The reason rides along only where the provider accepts feedback.
          ["runtime-request.respond", "decline", true],
          ["runtime-request.respond", "decline", false],
        ],
      );
      const log = (yield* fileSystem.readFileString(
        path.join(baseDir, "bots", instanceId, "decisions.jsonl"),
      ))
        .trim()
        .split("\n")
        .map(
          (line) => JSON.parse(line) as { outcome: string; rule: string | null; summary: string },
        );
      // The log shows the command itself, not the tool's JSON arguments.
      assert.equal(log[0]?.summary, "Allow bash?: sudo -n apt install nginx");
      assert.deepEqual(
        log.map((entry) => [entry.outcome, entry.rule]),
        [
          ["blocked", "Runs as root"],
          ["asked", null],
          ["blocked", "No payments site"],
        ],
      );
    }).pipe(Effect.scoped),
  );
});
