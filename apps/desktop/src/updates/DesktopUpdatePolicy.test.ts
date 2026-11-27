import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as DesktopManagedPolicy from "../app/DesktopManagedPolicy.ts";
import * as DesktopUpdatePolicy from "./DesktopUpdatePolicy.ts";

const policyOn = (document?: Parameters<typeof DesktopManagedPolicy.layerTest>[0]) =>
  DesktopUpdatePolicy.DesktopUpdatePolicy.pipe(
    Effect.provide(
      DesktopUpdatePolicy.layer.pipe(Layer.provide(DesktopManagedPolicy.layerTest(document))),
    ),
  );

// The inherited updater installs T3 Code's releases, so a machine without a policy never updates.
it.effect("turns updates off on a machine without a managed policy", () =>
  Effect.gen(function* () {
    const policy = yield* policyOn();
    assert.equal(policy.mode, "off");
    assert.include(policy.message ?? "", "P4 Bot has no releases");
  }),
);
