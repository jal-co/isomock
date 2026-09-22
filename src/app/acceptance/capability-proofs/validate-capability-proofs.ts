import { TOOLCRAFT_CAPABILITY_PROOF_CATALOG } from "./catalog";
import { getToolcraftMasksProofErrors } from "./masks";
import { dispatchToolcraftCapabilityProofOwners } from "./owner-dispatch";
import { getToolcraftCanvasEditingProofErrors } from "../canvas-handle-acceptance";
import { getControlAcceptanceByTarget } from "../control-acceptance-context";
import { getToolcraftOrientationGizmoCoverageErrors } from "../control-acceptance-coverage";
import { getToolcraftExportArtifactProofErrors } from "../export-artifact-coverage";
import { getToolcraftMediaSourceProofErrors } from "../media-upload";
import { getToolcraftModel3dProofErrors } from "../model-import-coverage";
import {
  getToolcraftLayerCoverageErrors,
  getToolcraftTimelineKeyframeCoverageErrors,
  getToolcraftTimelinePlaybackCoverageErrors,
} from "../runtime-coverage";
import type {
  ToolcraftCapabilityProofOwnerId,
  ToolcraftCapabilityProofOwnerRegistry,
  ToolcraftCapabilityProofRecipe,
  ToolcraftCapabilityProofValidationInput,
} from "./types";

function hasActiveCapability(
  activeCapabilities: readonly string[],
  capabilityId: string,
): boolean {
  return activeCapabilities.includes(capabilityId);
}
type RecipeForOwner<OwnerId extends ToolcraftCapabilityProofOwnerId> = Extract<
  ToolcraftCapabilityProofRecipe,
  { ownerId: OwnerId }
>;

function getRequiredOwnerRecipe<
  OwnerId extends ToolcraftCapabilityProofOwnerId,
>(
  input: Parameters<ToolcraftCapabilityProofOwnerRegistry[OwnerId]>[0],
  capabilityId: string,
  ownerId: OwnerId,
  proofKind: RecipeForOwner<OwnerId>["proof"]["kind"],
): RecipeForOwner<OwnerId> {
  const recipe = input.recipes.find(
    (candidate) => candidate.capabilityId === capabilityId,
  );
  if (recipe?.ownerId !== ownerId || recipe.proof.kind !== proofKind) {
    throw new Error(
      `Toolcraft capability proof recipe "${capabilityId}" is not correlated with owner "${ownerId}".`,
    );
  }
  return recipe as RecipeForOwner<OwnerId>;
}

function getSpatialViewProofErrors(
  input: Parameters<ToolcraftCapabilityProofOwnerRegistry["spatial-view"]>[0],
): string[] {
  const { activeCapabilities, context } = input;
  const recipe = getRequiredOwnerRecipe(
    input,
    "spatial.view",
    "spatial-view",
    "spatial-view",
  );
  const capabilityActive = hasActiveCapability(
    activeCapabilities,
    recipe.capabilityId,
  );
  const spatialEntries = context.acceptance.filter(
    (entry) => entry.orientationGizmoCoverage !== undefined,
  );

  if (!capabilityActive) {
    return spatialEntries.map(
      (entry) =>
        `Acceptance "${entry.id}" claims spatial.view proof but that capability is absent.`,
    );
  }

  if (
    context.productReadiness.mode !== "product" ||
    context.productReadiness.viewInteraction.mode !== "orbit"
  ) {
    return [
      "spatial.view requires product viewInteraction mode orbit with orientation-gizmo correspondence.",
    ];
  }

  const errors: string[] = [];
  const canonicalSpatialEntries = spatialEntries.filter(
    (entry) =>
      entry.kind === "canvas-handle" &&
      entry.componentType === "orientationGizmo" &&
      entry.canvasHandle?.writesTarget,
  );
  for (const entry of spatialEntries) {
    if (!canonicalSpatialEntries.includes(entry)) {
      errors.push(
        `${entry.id} spatial.view must use canonical orientationGizmo canvas-handle proof.`,
      );
    }
  }
  const spatialAcceptanceByTarget = getControlAcceptanceByTarget(
    canonicalSpatialEntries,
  );
  const orientationTargets =
    context.productReadiness.viewInteraction.orientationTargets;
  for (const target of orientationTargets) {
    const entry = spatialAcceptanceByTarget.get(target);
    if (!entry) {
      errors.push(
        `spatial.view orbit target "${target}" requires orientationGizmo acceptance proof.`,
      );
      continue;
    }
    errors.push(
      ...getToolcraftOrientationGizmoCoverageErrors({
        entry,
        label: entry.id,
      }),
    );
  }

  for (const entry of canonicalSpatialEntries) {
    const target = entry.canvasHandle?.writesTarget;
    if (!target || !orientationTargets.includes(target)) {
      errors.push(
        `${entry.id} spatial.view proof must target a declared orbit orientation target.`,
      );
    }
  }

  return errors;
}

export const TOOLCRAFT_CAPABILITY_PROOF_OWNERS = Object.freeze({
  "artifact-export": (input) => {
    const capabilityProofs = input.recipes.map((candidate) =>
      getRequiredOwnerRecipe(
        input,
        candidate.capabilityId,
        "artifact-export",
        "artifact-export",
      ),
    );
    return getToolcraftExportArtifactProofErrors({
      acceptance: input.context.acceptance,
      capabilityIds: input.activeCapabilities,
      capabilityProofs,
      schema: input.context.schema,
    });
  },
  "canvas-editing": (input) => {
    const recipe = getRequiredOwnerRecipe(
      input,
      "canvas.editing",
      "canvas-editing",
      "canvas-editing",
    );
    return getToolcraftCanvasEditingProofErrors({
      acceptance: input.context.acceptance,
      capabilityActive: hasActiveCapability(
        input.activeCapabilities,
        recipe.capabilityId,
      ),
      controls: input.context.controls,
      productReadiness: input.context.productReadiness,
    });
  },
  layers: (input) => {
    const recipe = getRequiredOwnerRecipe(
      input,
      "layers.management",
      "layers",
      "layers",
    );
    return getToolcraftLayerCoverageErrors({
      acceptance: input.context.acceptance,
      layersEnabled: hasActiveCapability(
        input.activeCapabilities,
        recipe.capabilityId,
      ),
    });
  },
  masks: (input) => {
    const recipe = getRequiredOwnerRecipe(input, "foreground.soft-ellipses", "masks", "masks");
    return getToolcraftMasksProofErrors({
      capabilityActive: hasActiveCapability(input.activeCapabilities, recipe.capabilityId),
      context: input.context,
    });
  },
  "media-source": (input) => {
    const recipe = getRequiredOwnerRecipe(
      input,
      "media.source",
      "media-source",
      "media-source",
    );
    return getToolcraftMediaSourceProofErrors({
      acceptance: input.context.acceptance,
      capabilityActive: hasActiveCapability(
        input.activeCapabilities,
        recipe.capabilityId,
      ),
      controls: input.context.controls,
      layersEnabled: input.context.layersEnabled,
      persistence: input.context.persistence,
      persistenceSlice: recipe.proof.persistenceSlice,
      productReadiness: input.context.productReadiness,
      schema: input.context.schema,
    });
  },
  "model-3d": (input) => {
    const recipe = getRequiredOwnerRecipe(
      input,
      "model.3d",
      "model-3d",
      "model-3d",
    );
    return getToolcraftModel3dProofErrors({
      acceptance: input.context.acceptance,
      capabilityActive: hasActiveCapability(
        input.activeCapabilities,
        recipe.capabilityId,
      ),
      controls: input.context.controls,
    });
  },
  "spatial-view": getSpatialViewProofErrors,
  timeline: (input) => {
    const playbackRecipe = getRequiredOwnerRecipe(
      input,
      "timeline.playback",
      "timeline",
      "timeline",
    );
    const keyframesRecipe = getRequiredOwnerRecipe(
      input,
      "timeline.keyframes",
      "timeline",
      "timeline",
    );
    const playbackActive =
      playbackRecipe.proof.mode === "playback" &&
      hasActiveCapability(
        input.activeCapabilities,
        playbackRecipe.capabilityId,
      );
    const keyframesActive =
      keyframesRecipe.proof.mode === "keyframes" &&
      hasActiveCapability(
        input.activeCapabilities,
        keyframesRecipe.capabilityId,
      );
    const errors = [
      ...getToolcraftTimelinePlaybackCoverageErrors({
        acceptance: input.context.acceptance,
        timelineMode: playbackActive
          ? keyframesActive
            ? "keyframes"
            : "playback"
          : null,
      }),
      ...getToolcraftTimelineKeyframeCoverageErrors({
        acceptance: input.context.acceptance,
        timelineMode: keyframesActive ? "keyframes" : null,
      }),
    ];

    if (!playbackActive) {
      errors.push(
        ...input.context.acceptance.flatMap((entry) =>
          entry.timelineCoverage === playbackRecipe.proof.mode
            ? [
                `Acceptance "${entry.id}" claims ${playbackRecipe.capabilityId} proof but that capability is absent.`,
              ]
            : [],
        ),
      );
    }
    if (!keyframesActive) {
      errors.push(
        ...input.context.acceptance.flatMap((entry) =>
          entry.timelineCoverage === keyframesRecipe.proof.mode
            ? [
                `Acceptance "${entry.id}" claims ${keyframesRecipe.capabilityId} proof but that capability is absent.`,
              ]
            : [],
        ),
      );
    }

    return errors;
  },
} satisfies ToolcraftCapabilityProofOwnerRegistry);

export function validateToolcraftCapabilityProofs({
  context,
  plan,
}: ToolcraftCapabilityProofValidationInput): readonly string[] {
  return dispatchToolcraftCapabilityProofOwners({
    context,
    owners: TOOLCRAFT_CAPABILITY_PROOF_OWNERS,
    plan,
    recipes: TOOLCRAFT_CAPABILITY_PROOF_CATALOG,
  });
}
