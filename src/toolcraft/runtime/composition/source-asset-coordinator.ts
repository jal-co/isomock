import { createModelSourceBinding } from "../modules/built-ins/model-3d/core/source-binding";
import { mediaSourceHandlers } from "../modules/built-ins/media-source/core/source-handlers";
import { createToolcraftSourceAssetRuntime } from "../source-assets/source-asset-coordinator";
import { createToolcraftSourceAssetRegistry, type ToolcraftSourceAssetRegistry } from "../source-assets/source-asset-registry";
import type { ToolcraftModelWorkerClient } from "../model-import/worker/model-import-worker-client";
import type { ToolcraftCommand, ToolcraftState } from "../state/types";
import type { ToolcraftBinaryAssetRepository } from "../source-assets/repository/binary-asset-repository";
import type { ToolcraftSourceAssetCoordinator } from "../source-assets/source-asset-coordinator-types";
import { createToolcraftSourceAssetFeedback } from "../source-assets/source-asset-feedback";
export type { ToolcraftSourceAssetCoordinator, ToolcraftModelRepairCoordinator } from "../source-assets/source-asset-coordinator-types";

export type CreateToolcraftSourceAssetCoordinatorOptions = {
  createModelWorkerClient?: () => ToolcraftModelWorkerClient;
  dispatch: (command: ToolcraftCommand) => void;
  getState: () => ToolcraftState;
  jobIdFactory?: () => string;
  registry?: ToolcraftSourceAssetRegistry;
  repository: ToolcraftBinaryAssetRepository;
};

export function createToolcraftSourceAssetCoordinator(options: CreateToolcraftSourceAssetCoordinatorOptions): ToolcraftSourceAssetCoordinator {
  const capabilities = options.getState().schema.modulePlan.capabilities;
  const model = capabilities.some(entry => entry.capabilityId === "model.3d")
    ? createModelSourceBinding(options.getState, options.createModelWorkerClient) : undefined;
  const hasMedia = capabilities.some(entry => entry.capabilityId === "media.source");
  const registry = options.registry ?? createToolcraftSourceAssetRegistry([
    ...(model ? [model.handler] : []), ...(hasMedia ? mediaSourceHandlers : []),
  ]);
  const runtime = createToolcraftSourceAssetRuntime({
    ...options,
    binding: {
      registry,
      isDefaultReplacementCurrent: model?.isDefaultReplacementCurrent ?? (() => false),
      attach: model?.attach ?? (() => ({
        services: {
          hydrateModels: async () => { },
          repairModel: async () => ({ kind: "rejected" as const, feedback: createToolcraftSourceAssetFeedback("model-module-absent", "Model repair requires the model-3d module.") }),
        },
        cancel: () => { }, settle: async () => { }, dispose: () => { },
      })),
    },
  });
  return { ...runtime.coordinator, ...runtime.services };
}
