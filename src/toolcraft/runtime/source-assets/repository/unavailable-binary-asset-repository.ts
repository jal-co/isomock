import type { ToolcraftBinaryAssetRepository } from "./binary-asset-repository";

function unavailable(): never {
  throw new Error(
    "Durable binary media storage is unavailable because IndexedDB could not be opened.",
  );
}

export function createUnavailableToolcraftBinaryAssetRepository(): ToolcraftBinaryAssetRepository {
  return {
    async beginLease() {
      return unavailable();
    },
    async collect() {
      return unavailable();
    },
    async dispose() {
      // No backing resource was opened.
    },
    async get() {
      return unavailable();
    },
  };
}
