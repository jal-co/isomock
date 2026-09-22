import type { ToolcraftControlSchema } from "../schema/types";
import type {
  ToolcraftSourceAssetBatch,
  ToolcraftSourceAssetClaim,
  ToolcraftSourceAssetKind,
  ToolcraftSourceAssetMatchHandler,
  ToolcraftSourceAssetRegistrableHandler,
  ToolcraftSourceAssetSelection,
} from "./source-asset-types";

export type ToolcraftSourceAssetRegistry<
  Handler extends ToolcraftSourceAssetRegistrableHandler = ToolcraftSourceAssetRegistrableHandler,
> = Readonly<{
  handlers: readonly Handler[];
}>;

type SourceAssetCandidate = {
  claim: ToolcraftSourceAssetClaim;
  control: ToolcraftControlSchema;
};

type SourceAssetHandlerForKind<
  Handler extends ToolcraftSourceAssetMatchHandler,
  Kind extends ToolcraftSourceAssetKind,
> = Handler extends ToolcraftSourceAssetMatchHandler
  ? Kind extends Handler["kind"]
    ? Handler
    : never
  : never;

const AMBIGUOUS_TARGET_SELECTION: ToolcraftSourceAssetSelection = Object.freeze({
  feedback: Object.freeze({
    category: "bundle" as const,
    code: "ambiguous-target",
    message:
      "The selected files match more than one equally specific upload target.",
  }),
  kind: "ambiguous" as const,
});

function cloneAndValidateClaim(
  handler: ToolcraftSourceAssetMatchHandler,
  claim: ToolcraftSourceAssetClaim,
): ToolcraftSourceAssetClaim {
  if (claim.handlerKind !== handler.kind) {
    throw new Error(
      `[source-asset-registry] Handler "${handler.kind}" returned claim kind "${claim.handlerKind}".`,
    );
  }
  if (!Number.isFinite(claim.specificity) || claim.specificity < 0) {
    throw new Error(
      `[source-asset-registry] Handler "${handler.kind}" returned an invalid specificity.`,
    );
  }
  if (
    claim.rootFileNames.length === 0 ||
    claim.rootFileNames.some(
      (fileName) => typeof fileName !== "string" || fileName.trim().length === 0,
    )
  ) {
    throw new Error(
      `[source-asset-registry] Handler "${handler.kind}" returned invalid root file names.`,
    );
  }

  return Object.freeze({
    handlerKind: claim.handlerKind,
    rootFileNames: Object.freeze([...claim.rootFileNames]),
    specificity: claim.specificity,
  });
}

export function createToolcraftSourceAssetRegistry<
  const Handler extends ToolcraftSourceAssetRegistrableHandler,
>(handlers: readonly Handler[]): ToolcraftSourceAssetRegistry<Handler> {
  const kinds = new Set<ToolcraftSourceAssetKind>();
  const registeredHandlers = handlers.map((handler) => {
    if (
      typeof handler.match !== "function" ||
      typeof handler.plan !== "function" ||
      typeof handler.prepare !== "function"
    ) {
      throw new Error(
        `[source-asset-registry] Handler "${handler.kind}" must implement match, plan, and prepare.`,
      );
    }
    if (kinds.has(handler.kind)) {
      throw new Error(
        `[source-asset-registry] Duplicate handler kind "${handler.kind}".`,
      );
    }
    kinds.add(handler.kind);
    return Object.freeze({ ...handler });
  });

  return Object.freeze({ handlers: Object.freeze(registeredHandlers) });
}

export function getToolcraftSourceAssetHandler<
  Handler extends ToolcraftSourceAssetRegistrableHandler,
  Kind extends Handler["kind"],
>(
  registry: ToolcraftSourceAssetRegistry<Handler>,
  kind: Kind,
): SourceAssetHandlerForKind<Handler, Kind> | undefined {
  return registry.handlers.find(
    (handler) => handler.kind === kind,
  ) as SourceAssetHandlerForKind<Handler, Kind> | undefined;
}

export function selectToolcraftSourceAssetHandler(
  registry: ToolcraftSourceAssetRegistry,
  batch: ToolcraftSourceAssetBatch,
  controls: readonly ToolcraftControlSchema[],
): ToolcraftSourceAssetSelection {
  if (batch.files.length === 0 || controls.length === 0) {
    return { kind: "none" };
  }

  const eligibleControls = batch.target
    ? controls.filter((control) => control.target === batch.target)
    : controls;
  const candidates: SourceAssetCandidate[] = [];
  for (const control of eligibleControls) {
    for (const handler of registry.handlers) {
      const claim = handler.match(batch, control);
      if (claim) {
        candidates.push({
          claim: cloneAndValidateClaim(handler, claim),
          control,
        });
      }
    }
  }

  const specializedCandidates = candidates.filter(
    ({ claim }) => claim.handlerKind !== "file",
  );
  const eligibleCandidates =
    specializedCandidates.length > 0 ? specializedCandidates : candidates;
  if (eligibleCandidates.length === 0) {
    return { kind: "none" };
  }

  const highestSpecificity = Math.max(
    ...eligibleCandidates.map(({ claim }) => claim.specificity),
  );
  const selectedCandidates = eligibleCandidates.filter(
    ({ claim }) => claim.specificity === highestSpecificity,
  );
  if (selectedCandidates.length !== 1) {
    return AMBIGUOUS_TARGET_SELECTION;
  }

  const selected = selectedCandidates[0];
  if (!selected) {
    return { kind: "none" };
  }
  return {
    claim: selected.claim,
    control: selected.control,
    kind: "selected",
  };
}
