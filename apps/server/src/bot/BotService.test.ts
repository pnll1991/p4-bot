import { assert, it } from "@effect/vitest";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  BotProfile,
  type ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  resolveProjectProviderInstanceEnabled,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as ServerConfig from "../config.ts";
import * as GitManager from "../git/GitManager.ts";
import * as GitWorkflow from "../git/GitWorkflowService.ts";
import * as RuntimeLayer from "../orchestration-v2/runtimeLayer.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ManagedProjectFolders from "../project/ManagedProjectFolders.ts";
import * as ProjectEnrichmentService from "../project/ProjectEnrichmentService.ts";
import * as ProjectFaviconResolver from "../project/ProjectFaviconResolver.ts";
import * as RepositoryIdentityResolver from "../project/RepositoryIdentityResolver.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import * as BotService from "./BotService.ts";

const decodeProfile = Schema.decodeEffect(Schema.fromJsonString(BotProfile));

const layerEnrichment = ProjectEnrichmentService.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      Layer.succeed(RepositoryIdentityResolver.RepositoryIdentityResolver, {
        resolve: () => Effect.succeed(null),
      }),
      Layer.succeed(ProjectFaviconResolver.ProjectFaviconResolver, {
        invalidate: () => Effect.void,
        resolvePath: () => Effect.succeed(null),
      }),
    ),
  ),
);

const layer = (baseDir: string) =>
  BotService.layer.pipe(
    Layer.provideMerge(ManagedProjectFolders.layer),
    Layer.provideMerge(RuntimeLayer.layerProjectService),
    Layer.provideMerge(layerEnrichment),
    Layer.provideMerge(WorkspacePaths.layer),
    Layer.provideMerge(
      GitWorkflow.layer.pipe(
        Layer.provide(VcsDriverRegistry.layer.pipe(Layer.provide(VcsProcess.layer))),
        Layer.provide(Layer.mock(GitManager.GitManager)({})),
      ),
    ),
    Layer.provideMerge(GitVcsDriver.layer.pipe(Layer.provide(VcsProcess.layer))),
    Layer.provideMerge(SqlitePersistence.layerMemory),
    Layer.provideMerge(
      ServerSettings.layerTest({
        providerInstances: {
          [ProviderInstanceId.make("personal")]: {
            driver: ProviderDriverKind.make("codex"),
            enabled: true,
          },
        },
      }),
    ),
    Layer.provideMerge(ServerConfig.layerTest(baseDir, baseDir)),
    Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
  );

it.effect("creates a Bot with its own files, home and project-only provider instance", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const baseDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "p4-bot-" });

    yield* Effect.gen(function* () {
      const bots = yield* BotService.BotService;
      const settingsService = yield* ServerSettings.ServerSettingsService;

      const profile = yield* bots.create({
        name: "Asistente de compras",
        persona: "Sos un asistente que compara precios. Respondé en español rioplatense.",
        runtime: "codex",
        model: "gpt-5.5",
      });

      const agents = yield* fileSystem.readFileString(
        path.join(profile.workspaceRoot, "AGENTS.md"),
      );
      assert.include(agents, "# Asistente de compras");
      assert.include(agents, "español rioplatense");
      assert.isTrue(
        yield* fileSystem.exists(path.join(profile.workspaceRoot, "memory", "README.md")),
      );

      const botDir = path.join(baseDir, "bots", profile.providerInstanceId);
      assert.isFalse(profile.workspaceRoot.startsWith(botDir));
      assert.deepEqual(
        yield* decodeProfile(yield* fileSystem.readFileString(path.join(botDir, "bot.json"))),
        profile,
      );

      const settings = yield* settingsService.getSettings;
      const instanceId = profile.providerInstanceId;
      const instance = settings.providerInstances[instanceId];
      assert.equal(instance?.driver, "codex");
      assert.deepEqual(instance?.config, { homePath: path.join(botDir, "provider-home") });

      const enabledIn = (projectId: ProjectId | null, id: string) =>
        resolveProjectProviderInstanceEnabled(settings, projectId, ProviderInstanceId.make(id));
      assert.isTrue(enabledIn(profile.projectId, instanceId));
      assert.isFalse(enabledIn(null, instanceId));
      for (const other of ["personal", "codex", "claudeAgent"]) {
        assert.isFalse(enabledIn(profile.projectId, other), other);
      }

      const local = yield* bots.create({
        name: "Local",
        persona: "Usá el modelo local.",
        runtime: "pi",
        model: "maya/inkling-2-mini",
      });
      const localInstance = (yield* settingsService.getSettings).providerInstances[
        local.providerInstanceId
      ];
      // Pi reuses the machine's Pi agent dir, where local model endpoints are configured.
      assert.equal(localInstance?.driver, "pi");
      assert.deepEqual(localInstance?.config, {});

      assert.deepEqual(yield* bots.list, [profile, local]);

      const overrides = settings.projectSettingsOverrides[profile.projectId];
      assert.equal(overrides?.defaultRuntimeMode, "approval-required");
      assert.deepEqual(overrides?.defaultModelSelection, { instanceId, model: "gpt-5.5" });
    }).pipe(Effect.provide(layer(baseDir)));
  }).pipe(Effect.scoped, Effect.provide(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer))),
);
