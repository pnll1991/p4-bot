import {
  BotDecision,
  type BotRule,
  CommandId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2RuntimeRequest,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import { readableApprovalPrompt } from "@t3tools/shared/approvalPrompt";

import * as ServerConfig from "../config.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import { forkParked } from "../serverActivation.ts";
import { BUILT_IN_BOT_RULES, matchBotRule } from "./botRules.ts";
import * as BotService from "./BotService.ts";

/**
 * Screens a Bot's action requests before the owner sees them. A request that matches a block
 * rule is declined with the reason; anything else is left to the owner. It never approves:
 * approving for the owner would fake a permission mode the provider does not enforce.
 */
export class BotGuard extends Context.Service<
  BotGuard,
  {
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
    readonly handle: (event: OrchestrationV2DomainEvent) => Effect.Effect<void>;
  }
>()("t3/bot/BotGuard") {}

const SCREENED_KINDS: ReadonlyArray<OrchestrationV2RuntimeRequest["kind"]> = [
  "command",
  "file-read",
  "file-change",
  "permission",
];

const SUMMARY_LIMIT = 300;

const make = Effect.gen(function* () {
  const engine = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const bots = yield* BotService.BotService;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const botsRoot = path.resolve((yield* ServerConfig.ServerConfig).baseDir, "bots");
  const encodeDecision = Schema.encodeEffect(Schema.fromJsonString(BotDecision));

  const record = Effect.fnUntraced(function* (instanceId: string, decision: BotDecision) {
    const line = yield* encodeDecision(decision);
    yield* fileSystem.writeFileString(
      path.join(botsRoot, instanceId, "decisions.jsonl"),
      `${line}\n`,
      {
        flag: "a",
      },
    );
  });

  // Providers without live feedback (Pi) still get the decline; only the reason is dropped.
  const decline = Effect.fnUntraced(function* (
    threadId: ThreadId,
    requestId: OrchestrationV2RuntimeRequest["id"],
    rule: BotRule,
  ) {
    const request = yield* projections.getRuntimeRequest(threadId, requestId);
    const takesFeedback =
      request?.responseCapability.type === "live" &&
      request.responseCapability.supportsFeedback === true;
    yield* engine.dispatch({
      type: "runtime-request.respond",
      commandId: CommandId.make(`server:bot-guard:${threadId}:${requestId}`),
      threadId,
      requestId,
      decision: "decline",
      ...(takesFeedback
        ? {
            feedback: `Blocked by this bot's rules (${rule.label ?? rule.pattern}). Do not retry it or work around it; tell the owner what you needed and why.`,
          }
        : {}),
    });
  });

  // A provider can repeat a waiting item; screen each request once.
  const screened = new Set<string>();

  // Runs for every domain event; anything but a new approval request returns at once. The
  // approval item carries the request's text, so this reads nothing the event does not hold.
  const handle: BotGuard["Service"]["handle"] = Effect.fnUntraced(
    function* (event) {
      if (event.type !== "turn-item.updated") return;
      const item = event.payload;
      if (item.type !== "approval_request" || item.status !== "waiting") return;
      if (!SCREENED_KINDS.includes(item.requestKind) || screened.has(item.requestId)) return;
      screened.add(item.requestId);
      const thread = yield* projections.getThread(event.threadId);
      const bot = (yield* bots.list).find((profile) => profile.projectId === thread.projectId);
      if (bot === undefined) return;

      // Rules match the raw text; the log keeps what a person reads: the command, not its JSON.
      const text = [item.title, item.prompt, item.reason].filter(Boolean).join(": ");
      const readable = [
        item.title,
        item.prompt === undefined ? undefined : readableApprovalPrompt(item.prompt),
        item.reason,
      ]
        .filter(Boolean)
        .join(": ");
      const rule = matchBotRule([...BUILT_IN_BOT_RULES, ...(bot.rules ?? [])], {
        kind: item.requestKind,
        text,
      });
      if (rule !== null) yield* decline(event.threadId, item.requestId, rule);
      yield* record(bot.providerInstanceId, {
        at: DateTime.formatIso(yield* DateTime.now),
        threadId: event.threadId,
        requestId: item.requestId,
        kind: item.requestKind,
        summary: readable.slice(0, SUMMARY_LIMIT),
        outcome: rule === null ? "asked" : "blocked",
        rule: rule === null ? null : (rule.label ?? rule.pattern),
      });
    },
    Effect.catchCause((cause) =>
      Effect.logWarning("bot guard could not screen a request", { cause }),
    ),
  );

  const start: BotGuard["Service"]["start"] = Effect.fn("BotGuard.start")(function* () {
    yield* forkParked(
      Stream.runForEach(engine.streamDomainEvents, handle).pipe(
        Effect.catchCause((cause) => Effect.logWarning("bot guard event stream failed", { cause })),
      ),
    );
  });

  return BotGuard.of({ start, handle });
});

export const layer = Layer.effect(BotGuard, make);
