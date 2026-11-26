import * as Schema from "effect/Schema";

import { ForwardCompatibleArray, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

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
