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
    overview: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:bots:get",
      tag: WS_METHODS.botsGet,
      staleTimeMs: 5_000,
      refreshIntervalMs: 5_000,
    }),
    writeMemory: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:bots:memory-write",
      tag: WS_METHODS.botsMemoryWrite,
    }),
    deleteMemory: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:bots:memory-delete",
      tag: WS_METHODS.botsMemoryDelete,
    }),
    setRules: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:bots:rules-set",
      tag: WS_METHODS.botsRulesSet,
    }),
    setPermissions: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:bots:permissions-set",
      tag: WS_METHODS.botsPermissionsSet,
    }),
    createRoutine: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:bots:routine-create",
      tag: WS_METHODS.botsRoutineCreate,
    }),
  };
}
