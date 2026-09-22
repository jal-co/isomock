import type { ToolcraftHistoryPatch } from "./types";

const controlsResetHistorySource = "controls.reset" as const;
const canvasStateHistorySource = "canvas.state" as const;
const historyPatchMetadataNamespace = "toolcraft/history-patch-metadata/v1";
declare const historyPatchMetadataKeyType: unique symbol;
const historyPatchMetadataKey: typeof historyPatchMetadataKeyType = Symbol.for(
  historyPatchMetadataNamespace,
) as typeof historyPatchMetadataKeyType;

export type ToolcraftInternalHistoryPatchSource =
  | typeof canvasStateHistorySource
  | typeof controlsResetHistorySource;

type ToolcraftHistoryPatchMetadata = {
  workspaceReset?: boolean;
  domains?: ToolcraftHistoryPatchDomains;
  source?: ToolcraftInternalHistoryPatchSource;
};

export function tagToolcraftWorkspaceResetHistoryPatch(patch: ToolcraftHistoryPatch): ToolcraftHistoryPatch {
  const tagged = patch as ToolcraftHistoryPatchWithMetadata;
  const result: ToolcraftHistoryPatchWithMetadata = { ...tagged, [historyPatchMetadataKey]: { ...tagged[historyPatchMetadataKey], workspaceReset: true } };
  return result;
}

export function isToolcraftWorkspaceResetHistoryPatch(patch: ToolcraftHistoryPatch): boolean {
  return (patch as ToolcraftHistoryPatchWithMetadata)[historyPatchMetadataKey]?.workspaceReset === true;
}

export type ToolcraftHistoryPatchDomains = {
  state: Pick<ToolcraftHistoryPatch, "before" | "after">;
  values: Pick<ToolcraftHistoryPatch, "before" | "after">;
};

type ToolcraftHistoryPatchWithMetadata = ToolcraftHistoryPatch & {
  [historyPatchMetadataKey]?: ToolcraftHistoryPatchMetadata;
};

export function getToolcraftControlsResetHistorySource(): ToolcraftInternalHistoryPatchSource {
  return controlsResetHistorySource;
}

export function getToolcraftHistoryPatchSource(
  patch: ToolcraftHistoryPatch | undefined,
): ToolcraftInternalHistoryPatchSource | undefined {
  return (patch as ToolcraftHistoryPatchWithMetadata | undefined)?.[
    historyPatchMetadataKey
  ]?.source;
}

export function isToolcraftControlsResetHistoryPatch(
  patch: ToolcraftHistoryPatch | undefined,
): boolean {
  return getToolcraftHistoryPatchSource(patch) === controlsResetHistorySource;
}

export function isToolcraftCanvasStateHistoryPatch(
  patch: ToolcraftHistoryPatch | undefined,
): boolean {
  return getToolcraftHistoryPatchSource(patch) === canvasStateHistorySource;
}

export function tagToolcraftControlsResetHistoryPatch(
  patch: ToolcraftHistoryPatch,
  domains?: ToolcraftHistoryPatchDomains,
): ToolcraftHistoryPatch {
  const sourcedPatch = tagToolcraftHistoryPatchSource(
    patch,
    controlsResetHistorySource,
  );
  return domains
    ? tagToolcraftHistoryPatchDomains(sourcedPatch, domains)
    : sourcedPatch;
}

export function tagToolcraftHistoryPatchDomains(
  patch: ToolcraftHistoryPatch,
  domains: ToolcraftHistoryPatchDomains,
): ToolcraftHistoryPatch {
  const taggedPatch: ToolcraftHistoryPatchWithMetadata = {
    ...patch,
    before: { ...domains.values.before, ...domains.state.before },
    after: { ...domains.values.after, ...domains.state.after },
    [historyPatchMetadataKey]: {
      ...(patch as ToolcraftHistoryPatchWithMetadata)[historyPatchMetadataKey],
      domains,
    },
  };
  return taggedPatch;
}

export function getToolcraftHistoryPatchDomains(
  patch: ToolcraftHistoryPatch | undefined,
): ToolcraftHistoryPatchDomains | undefined {
  const metadata = (patch as ToolcraftHistoryPatchWithMetadata | undefined)?.[
    historyPatchMetadataKey
  ];
  return metadata?.domains;
}

/** Keep first-before/latest-after metadata in step with the public merged patch. */
function mergePatchFields(
  previous: Pick<ToolcraftHistoryPatch, "before" | "after">,
  next: Pick<ToolcraftHistoryPatch, "before" | "after">,
): Pick<ToolcraftHistoryPatch, "before" | "after"> {
  return {
    before: { ...next.before, ...previous.before },
    after: { ...previous.after, ...next.after },
  };
}

export function mergeToolcraftHistoryPatch(
  previous: ToolcraftHistoryPatch,
  next: ToolcraftHistoryPatch,
): ToolcraftHistoryPatch | undefined {
  const previousDomains = getToolcraftHistoryPatchDomains(previous);
  const nextDomains = getToolcraftHistoryPatchDomains(next);
  if (Boolean(previousDomains) !== Boolean(nextDomains)) {
    return undefined;
  }
  const merged = {
    ...previous,
    ...mergePatchFields(previous, next),
    label: next.label,
  };
  return previousDomains && nextDomains
    ? tagToolcraftHistoryPatchDomains(merged, {
        state: mergePatchFields(previousDomains.state, nextDomains.state),
        values: mergePatchFields(previousDomains.values, nextDomains.values),
      })
    : merged;
}

export function tagToolcraftCanvasStateHistoryPatch(
  patch: ToolcraftHistoryPatch,
): ToolcraftHistoryPatch {
  return tagToolcraftHistoryPatchSource(patch, canvasStateHistorySource);
}

export function tagToolcraftHistoryPatchSource(
  patch: ToolcraftHistoryPatch,
  source: ToolcraftInternalHistoryPatchSource | undefined,
): ToolcraftHistoryPatch {
  if (source === undefined) {
    return patch;
  }

  const taggedPatch: ToolcraftHistoryPatchWithMetadata = {
    ...patch,
    [historyPatchMetadataKey]: {
      ...(patch as ToolcraftHistoryPatchWithMetadata)[historyPatchMetadataKey],
      source,
    },
  };

  return taggedPatch;
}
