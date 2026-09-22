import type { ToolcraftPersistableStateSlice } from "../../schema/types";
import type {
  ToolcraftPersistenceModuleContribution,
} from "../contract/contribution";

export function resolveToolcraftPersistenceContributions(
  persistenceContributions: readonly ToolcraftPersistenceModuleContribution[],
): readonly ToolcraftPersistableStateSlice[] {
  return Object.freeze(
    persistenceContributions.map(({ slice }) => slice).sort(),
  );
}
