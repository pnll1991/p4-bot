import { assert, it } from "@effect/vitest";
import {
  type BotProfile,
  type OrchestrationV2ThreadShell,
  ProjectId,
  ProviderInstanceId,
  type RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ThreadLaunch from "../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as BotMessages from "./BotMessages.ts";
import * as BotService from "./BotService.ts";

const bot = (name: string, runtimeMode?: BotProfile["runtimeMode"]): BotProfile => ({
  version: 1,
  name,
  persona: `${name} ayuda.`,
  runtime: "pi",
  model: "maya/inkling-2-mini",
  projectId: ProjectId.make(`project-${name}`),
  workspaceRoot: `/bots/${name}`,
  providerInstanceId: ProviderInstanceId.make(`bot-${name}`),
  ...(runtimeMode === undefined ? {} : { runtimeMode }),
});

const ana = bot("Ana");
const beto = bot("Beto");
const anaChat = ThreadId.make("thread-ana");
const betoChat = ThreadId.make("thread-beto");

const shell = (id: ThreadId, projectId: ProjectId, runtimeMode: RuntimeMode) =>
  ({
    id,
    projectId,
    runtimeMode,
    updatedAt: DateTime.makeUnsafe("2026-11-26T12:00:00.000Z"),
  }) as unknown as OrchestrationV2ThreadShell;

const harness = (
  options: {
    readonly bots?: ReadonlyArray<BotProfile>;
    /** Beto's chat and its mode; omitted, Beto has no chat yet. */
    readonly betoChatMode?: RuntimeMode;
  },
  calls: Array<string>,
) => {
  const shells = new Map([[anaChat, shell(anaChat, ana.projectId, "approval-required")]]);
  if (options.betoChatMode !== undefined)
    shells.set(betoChat, shell(betoChat, beto.projectId, options.betoChatMode));
  return BotMessages.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(BotService.BotService)({ list: Effect.succeed(options.bots ?? [ana, beto]) }),
        Layer.mock(ProjectionStore.ProjectionStoreV2)({
          getThreadShell: (threadId) => Effect.succeed(shells.get(threadId) ?? null),
          listActiveThreads: (projectId) =>
            Effect.succeed(
              [...shells.values()]
                .filter((entry) => entry.projectId === projectId)
                .map((entry) => ({ id: entry.id })) as never,
            ),
        }),
        Layer.mock(ThreadManagement.ThreadManagementService)({
          sendToThread: (input) => {
            calls.push(`send:${input.threadId}:${input.senderThreadId}:${input.mode}`);
            calls.push(input.text);
            return Effect.succeed({} as never);
          },
        }),
        Layer.mock(ThreadLaunch.ThreadLaunchService)({
          launch: (input) => {
            calls.push(
              `launch:${input.projectId}:${input.runtimeMode}:${input.initialMessage?.senderThreadId}`,
            );
            return Effect.succeed({ threadId: betoChat } as never);
          },
        }),
        Layer.succeed(SecureRandom.SecureRandom, {
          ...SecureRandom.SecureRandom.of({} as never),
          uuidV4: () => Effect.succeed("00000000-0000-4000-8000-000000000000"),
        } as never),
      ),
    ),
  );
};

const send = (to: string, maxRuntimeMode: RuntimeMode = "approval-required") =>
  Effect.gen(function* () {
    const messages = yield* BotMessages.BotMessages;
    return yield* messages.send({
      fromThreadId: anaChat,
      to,
      text: "¿Qué compraste?",
      maxRuntimeMode,
    });
  });

it.effect("queues the message in the other bot's chat, saying who wrote it", () =>
  Effect.gen(function* () {
    const calls: Array<string> = [];
    const sent = yield* send(" beto ").pipe(
      Effect.provide(harness({ betoChatMode: "approval-required" }, calls)),
    );
    assert.deepEqual(sent, { to: "Beto", threadId: betoChat });
    assert.equal(calls[0], `send:${betoChat}:${anaChat}:queue`);
    // The chat folds a message to its first line, so the bot's own words lead.
    assert.isTrue(calls[1]?.startsWith("¿Qué compraste?\n"));
    assert.include(calls[1], 'From the bot "Ana"');
  }),
);

it.effect("starts the other bot's chat in its own mode when it has none", () =>
  Effect.gen(function* () {
    const calls: Array<string> = [];
    yield* send("Beto").pipe(Effect.provide(harness({}, calls)));
    assert.deepEqual(calls, [`launch:${beto.projectId}:approval-required:${anaChat}`]);
  }),
);

it.effect("refuses a bot that works with more access than the sender", () =>
  Effect.gen(function* () {
    const calls: Array<string> = [];
    const error = yield* send("Beto").pipe(
      Effect.provide(harness({ betoChatMode: "full-access" }, calls)),
      Effect.flip,
    );
    assert.equal(error.reason, "above-limit");
    assert.deepEqual(calls, []);
  }),
);

it.effect("names the bots when the name is unknown, and refuses writing to itself", () =>
  Effect.gen(function* () {
    const unknown = yield* send("Carla").pipe(Effect.provide(harness({}, [])), Effect.flip);
    assert.equal(unknown.reason, "unknown-bot");
    assert.include(unknown.message, '"Beto"');
    const self = yield* send("ana").pipe(Effect.provide(harness({}, [])), Effect.flip);
    assert.equal(self.reason, "self");
  }),
);

it.effect("refuses a chat that is not a bot's", () =>
  Effect.gen(function* () {
    const error = yield* send("Beto").pipe(
      Effect.provide(harness({ bots: [beto] }, [])),
      Effect.flip,
    );
    assert.equal(error.reason, "not-a-bot");
  }),
);

it.effect("stops two bots that keep answering each other", () =>
  Effect.gen(function* () {
    const calls: Array<string> = [];
    const error = yield* Effect.gen(function* () {
      for (let index = 0; index < BotMessages.MAX_BOT_MESSAGES_PER_HOUR; index++) {
        yield* send("Beto");
      }
      return yield* send("Beto").pipe(Effect.flip);
    }).pipe(Effect.provide(harness({ betoChatMode: "approval-required" }, calls)));
    assert.equal(error.reason, "too-many");
    assert.equal(calls.length, BotMessages.MAX_BOT_MESSAGES_PER_HOUR * 2);
  }),
);
