import { WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcCommand, createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";

export function createBotEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:bots:list",
      tag: WS_METHODS.botsList,
    }),
    create: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:bots:create",
      tag: WS_METHODS.botsCreate,
    }),
  };
}
