import { WS_METHODS, type EnvironmentId, type ServerSettings } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcCommand, createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";

export function createBotEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
  options: {
    readonly settings?: (environmentId: EnvironmentId) => Atom.Atom<ServerSettings | null>;
  } = {},
) {
  const settings = options.settings;
  return {
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:bots:list",
      tag: WS_METHODS.botsList,
      // Each bot owns a provider instance, added last on create and removed first on delete, so a
      // bot made or deleted elsewhere (an agent's MCP tool, another device) shows up here too.
      refreshTrigger: ({ environmentId }) => {
        if (settings === undefined) return undefined;
        const value = settings(environmentId);
        return Atom.make((get) =>
          Object.keys(get(value)?.providerInstances ?? {})
            .sort()
            .join("\n"),
        );
      },
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
    setRuntime: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:bots:runtime-set",
      tag: WS_METHODS.botsRuntimeSet,
    }),
    arrange: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:bots:arrange",
      tag: WS_METHODS.botsArrange,
    }),
    deleteBot: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:bots:delete",
      tag: WS_METHODS.botsDelete,
    }),
    startOver: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:bots:start-over",
      tag: WS_METHODS.botsStartOver,
    }),
    createRoutine: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:bots:routine-create",
      tag: WS_METHODS.botsRoutineCreate,
    }),
  };
}
