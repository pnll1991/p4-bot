import { createBotEnvironmentAtoms } from "@t3tools/client-runtime/state/bots";

import { connectionAtomRuntime } from "../connection/runtime";
import { serverEnvironment } from "./server";

export const botEnvironment = createBotEnvironmentAtoms(connectionAtomRuntime, {
  settings: serverEnvironment.settingsValueAtom,
});
