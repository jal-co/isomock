import type { ToolcraftCommand, ToolcraftState } from "../state/types";
import type { ToolcraftBinaryAssetRepository } from "./repository/binary-asset-repository";
import type { ToolcraftSourceAssetCleanupManager } from "./source-asset-cleanup-manager";
import type { ToolcraftSourceAssetImportRunner } from "./source-asset-import-runner";
import type { ToolcraftSourceAssetDefaultReplacement, ToolcraftSourceAssetJobManager } from "./source-asset-job-manager";
import type { ToolcraftSourceAssetOperationStore } from "./source-asset-operation-store";
import type { ToolcraftSourceAssetRegistry } from "./source-asset-registry";

export type ToolcraftSourceAssetRuntimeContext = Readonly<{
  cleanupManager: ToolcraftSourceAssetCleanupManager;
  dispatch: (command: ToolcraftCommand) => void;
  getState: () => ToolcraftState;
  importRunner: ToolcraftSourceAssetImportRunner;
  isDefaultReplacementCurrent: (replacement: ToolcraftSourceAssetDefaultReplacement) => boolean;
  jobManager: ToolcraftSourceAssetJobManager;
  operationStore: ToolcraftSourceAssetOperationStore;
  repository: ToolcraftBinaryAssetRepository;
}>;

export type ToolcraftSourceAssetRuntimeBinding<Services extends object> = Readonly<{
  registry: ToolcraftSourceAssetRegistry;
  isDefaultReplacementCurrent: (replacement: ToolcraftSourceAssetDefaultReplacement) => boolean;
  attach: (context: ToolcraftSourceAssetRuntimeContext) => Readonly<{
    services: Services;
    cancel: () => void | Promise<void>;
    settle: () => Promise<void>;
    dispose: () => void | Promise<void>;
  }>;
}>;
