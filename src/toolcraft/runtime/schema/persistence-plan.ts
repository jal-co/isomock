import { normalizeToolcraftAdditionalValueTargets } from "./additional-value-targets";
import { assertToolcraftProductTargetNamespace } from "./collection-actions";
import type { ResolvedToolcraftAppSchema } from "./resolved-app-schema";
import type {
  ResolvedToolcraftAppIdentity,
  ToolcraftPersistableStateSlice,
} from "./types";
import type { ToolcraftProductPersistence } from "./product-base";

const BASE_PERSISTENCE_SLICES = ["canvas", "panels", "values"] as const;
const CURRENT_PERSISTENCE_VERSION = 2;

type ToolcraftPersistencePlanInput = Readonly<{
  identity: ResolvedToolcraftAppIdentity;
  persistence: ToolcraftProductPersistence | undefined;
  requiredSlices: readonly ToolcraftPersistableStateSlice[];
  collectionSelectionTargets?: readonly string[];
}>;

function createLocalStoragePersistencePlan({
  additionalValueTargets,
  identity,
  include,
}: Readonly<{
  additionalValueTargets: readonly string[];
  identity: ResolvedToolcraftAppIdentity;
  include: ReadonlySet<ToolcraftPersistableStateSlice>;
}>): ResolvedToolcraftAppSchema["persistence"] {
  return Object.freeze({
    additionalValueTargets,
    include: Object.freeze([...include].sort()),
    key: `toolcraft:${identity.id}:state:v${CURRENT_PERSISTENCE_VERSION}` as const,
    storage: "localStorage" as const,
    version: CURRENT_PERSISTENCE_VERSION,
  });
}

export function resolveToolcraftPersistencePlan({
  collectionSelectionTargets = [],
  identity,
  persistence,
  requiredSlices,
}: ToolcraftPersistencePlanInput): ResolvedToolcraftAppSchema["persistence"] {
  if (persistence?.storage === "none") {
    if (requiredSlices.length > 0) {
      throw new Error(
        `Toolcraft product persistence storage "none" conflicts with resolved persistence slices: ${[
          ...new Set(requiredSlices),
        ]
          .sort()
          .join(", ")}.`,
      );
    }
    return Object.freeze({ storage: "none" as const });
  }

  const include = new Set<ToolcraftPersistableStateSlice>(
    BASE_PERSISTENCE_SLICES,
  );
  for (const slice of requiredSlices) include.add(slice);
  const additionalValueTargets = normalizeToolcraftAdditionalValueTargets([
    ...(persistence?.additionalValueTargets ?? []),
    ...collectionSelectionTargets,
  ]);
  for (const target of additionalValueTargets) {
    assertToolcraftProductTargetNamespace(target, `persistence additional value target "${target}"`);
  }
  return createLocalStoragePersistencePlan({
    additionalValueTargets,
    identity,
    include,
  });
}
