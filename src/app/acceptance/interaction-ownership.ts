import { isCustomToolcraftControl } from "./custom-controls";
import { isToolcraftSupportedInteractionTarget } from "./interaction-targets";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftInteractionCapability,
  ToolcraftInteractionEvidenceSource,
  ToolcraftInteractionOwnershipEntry,
  ToolcraftInteractionSurface,
  ToolcraftProductReadiness,
  ToolcraftVisibleControl,
} from "./types";

type ToolcraftInteractionOwnershipValidationInput = {
  acceptance: readonly ToolcraftComponentAcceptance[];
  controls: readonly ToolcraftVisibleControl[];
  productReadiness: ToolcraftProductReadiness;
};

const interactionCapabilities = new Set<ToolcraftInteractionCapability>([
  "collection-edit",
  "command",
  "direct-spatial-edit",
  "precise-value-entry",
  "property-edit",
  "spatial-selection",
  "structured-selection",
]);

const interactionEvidenceSources = new Set<ToolcraftInteractionEvidenceSource>([
  "reference",
  "usability-analysis",
  "user-request",
]);

const interactionSurfaces = new Set<ToolcraftInteractionSurface>([
  "canvas",
  "panel",
]);

function getAcceptanceSurface(
  entry: ToolcraftComponentAcceptance,
): ToolcraftInteractionSurface | null {
  if (entry.kind === "canvas-handle") return "canvas";
  if (entry.kind === "control") return "panel";
  return null;
}

function getAcceptanceTarget(
  entry: ToolcraftComponentAcceptance,
): string | undefined {
  return entry.kind === "canvas-handle"
    ? entry.canvasHandle?.writesTarget
    : entry.target;
}

function getEntryShapeErrors(
  entry: ToolcraftInteractionOwnershipEntry,
  controlTargets: ReadonlySet<string>,
  acceptanceTargets: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  const expectedAlternative = entry.surface === "canvas" ? "panel" : "canvas";

  if (!entry.id.trim()) {
    errors.push("interactionOwnership ids must be non-empty.");
  }

  if (!entry.target.trim()) {
    errors.push(`${entry.id || "interactionOwnership entry"} target must be non-empty.`);
  } else if (
    !(
      (entry.capability === "spatial-selection" ||
        entry.capability === "structured-selection") &&
      acceptanceTargets.has(entry.target)
    ) &&
    !isToolcraftSupportedInteractionTarget(entry.target, controlTargets)
  ) {
    errors.push(
      `${entry.id} target ${entry.target} does not match a schema target or supported editor command.`,
    );
  }

  if (!interactionCapabilities.has(entry.capability)) {
    errors.push(`${entry.id} capability ${entry.capability} is not supported.`);
  }

  if (!interactionSurfaces.has(entry.surface)) {
    errors.push(`${entry.id} surface ${entry.surface} must be canvas or panel.`);
  }

  if (entry.reason.trim().length < 24) {
    errors.push(
      `${entry.id} reason must explain why the selected surface is more usable for this operation.`,
    );
  }

  if (!interactionEvidenceSources.has(entry.evidence.source)) {
    errors.push(
      `${entry.id} evidence.source must be user-request, reference, or usability-analysis.`,
    );
  }

  if (entry.evidence.detail.trim().length < 24) {
    errors.push(
      `${entry.id} evidence.detail must identify the request, inspected reference, or usability comparison supporting the choice.`,
    );
  }

  if (entry.alternative.surface !== expectedAlternative) {
    errors.push(
      `${entry.id} alternative.surface must be ${expectedAlternative} because ${entry.surface} owns the operation.`,
    );
  }

  if (entry.alternative.reason.trim().length < 24) {
    errors.push(
      `${entry.id} alternative.reason must explain why the other surface does not own the same operation.`,
    );
  }

  return [...new Set(errors)];
}

function getRequiredInteractionLinkError({
  entry,
  handleTargets,
  visibleControlByTarget,
}: {
  entry: ToolcraftComponentAcceptance;
  handleTargets: ReadonlySet<string>;
  visibleControlByTarget: ReadonlyMap<string, ToolcraftVisibleControl>;
}): string | null {
  if (entry.kind === "canvas-handle" && !entry.interactionId?.trim()) {
    return `${entry.id} canvas handle must reference interactionId.`;
  }

  if (entry.kind !== "control" || entry.interactionId?.trim()) {
    return null;
  }

  const target = getAcceptanceTarget(entry);
  const visibleControl = target ? visibleControlByTarget.get(target) : undefined;
  const isCustomInteraction = Boolean(
    visibleControl &&
      isCustomToolcraftControl(visibleControl.control) &&
      entry.builtInFitCheck?.capabilities.includes("custom-interaction"),
  );

  if (isCustomInteraction) {
    return `${entry.id} custom interaction control must reference interactionId.`;
  }

  if (target && handleTargets.has(target)) {
    return `${entry.id} panel control shares ${target} with a canvas handle and must reference interactionId.`;
  }

  return null;
}

export function getToolcraftInteractionOwnershipErrors({
  acceptance,
  controls,
  productReadiness,
}: ToolcraftInteractionOwnershipValidationInput): string[] {
  if (productReadiness.mode !== "product") {
    return [];
  }

  const inventory = productReadiness.interactionOwnership;

  if (!inventory) {
    return [
      "Product readiness must declare interactionOwnership before controls or canvas interactions so one operation cannot be implemented on both surfaces.",
    ];
  }

  const errors: string[] = [];
  const controlTargets = new Set(controls.map(({ control }) => control.target));
  const acceptanceTargets = new Set(
    acceptance.flatMap((entry) => {
      const target = getAcceptanceTarget(entry);
      return target ? [target] : [];
    }),
  );
  const visibleControlByTarget = new Map(
    controls.map((control) => [control.control.target, control] as const),
  );
  const handleTargets = new Set(
    acceptance.flatMap((entry) =>
      entry.kind === "canvas-handle" && entry.canvasHandle?.writesTarget
        ? [entry.canvasHandle.writesTarget]
        : [],
    ),
  );
  const inventoryById = new Map<string, ToolcraftInteractionOwnershipEntry>();
  const duplicateIds = new Set<string>();

  for (const entry of inventory) {
    errors.push(
      ...getEntryShapeErrors(entry, controlTargets, acceptanceTargets),
    );

    if (inventoryById.has(entry.id)) {
      duplicateIds.add(entry.id);
    } else {
      inventoryById.set(entry.id, entry);
    }
  }

  for (const id of duplicateIds) {
    errors.push(`interactionOwnership id ${id} must be unique.`);
  }

  const acceptanceSurfacesByInteraction = new Map<
    string,
    Set<ToolcraftInteractionSurface>
  >();
  const linkedInteractionIds = new Set<string>();

  for (const entry of acceptance) {
    const requiredLinkError = getRequiredInteractionLinkError({
      entry,
      handleTargets,
      visibleControlByTarget,
    });
    if (requiredLinkError) errors.push(requiredLinkError);

    const interactionId = entry.interactionId?.trim();
    if (!interactionId) continue;

    const owner = inventoryById.get(interactionId);
    if (!owner) {
      errors.push(
        `${entry.id} interactionId ${interactionId} does not match interactionOwnership.`,
      );
      continue;
    }

    linkedInteractionIds.add(interactionId);
    const surface = getAcceptanceSurface(entry);
    const target = getAcceptanceTarget(entry);

    if (surface && owner.surface !== surface) {
      errors.push(
        `${entry.id} renders on ${surface}, but interactionOwnership ${interactionId} assigns the operation to ${owner.surface}.`,
      );
    }

    if (target && owner.target !== target) {
      errors.push(
        `${entry.id} writes ${target}, but interactionOwnership ${interactionId} owns ${owner.target}.`,
      );
    }

    if (surface) {
      const surfaces = acceptanceSurfacesByInteraction.get(interactionId) ?? new Set();
      surfaces.add(surface);
      acceptanceSurfacesByInteraction.set(interactionId, surfaces);
    }
  }

  for (const [interactionId, surfaces] of acceptanceSurfacesByInteraction) {
    if (surfaces.size > 1) {
      errors.push(
        `${interactionId} is implemented on both canvas and panel; one user operation must have one primary surface.`,
      );
    }
  }

  const surfacesByTargetCapability = new Map<
    string,
    Set<ToolcraftInteractionSurface>
  >();

  for (const entry of inventory) {
    const key = `${entry.target}\u0000${entry.capability}`;
    const surfaces = surfacesByTargetCapability.get(key) ?? new Set();
    surfaces.add(entry.surface);
    surfacesByTargetCapability.set(key, surfaces);
  }

  for (const [key, surfaces] of surfacesByTargetCapability) {
    if (surfaces.size <= 1) continue;
    const [target, capability] = key.split("\u0000");
    errors.push(
      `target "${target}" duplicates ${capability} across canvas and panel; choose one owner for that operation or declare genuinely different capabilities.`,
    );
  }

  for (const entry of inventory) {
    if (!linkedInteractionIds.has(entry.id)) {
      errors.push(
        `${entry.id} interactionOwnership has no matching acceptance row on ${entry.surface}.`,
      );
    }
  }

  return errors;
}
