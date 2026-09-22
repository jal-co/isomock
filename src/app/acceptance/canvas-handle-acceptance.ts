import type {
  ToolcraftComponentAcceptance,
  ToolcraftProductReadiness,
  ToolcraftVisibleControl,
} from "./types";
import { isToolcraftSupportedInteractionTarget } from "./interaction-targets";

export function getToolcraftCanvasHandleAcceptanceErrors({
  acceptance,
  controlTargets,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  controlTargets: ReadonlySet<string>;
}): string[] {
  const errors: string[] = [];

  for (const entry of acceptance) {
    if (entry.kind !== "canvas-handle") {
      continue;
    }

    if (!entry.canvasHandle) {
      errors.push(`${entry.id} canvas handle is missing canvasHandle metadata.`);
      continue;
    }

    if (!entry.canvasHandle.testId.trim()) {
      errors.push(`${entry.id} canvas handle must provide a stable testId.`);
    }

    if (!entry.canvasHandle.writesTarget.trim()) {
      errors.push(`${entry.id} canvas handle must name the runtime target it writes.`);
    }

    if (
      entry.canvasHandle.writesTarget &&
      !isToolcraftSupportedInteractionTarget(
        entry.canvasHandle.writesTarget,
        controlTargets,
      )
    ) {
      errors.push(
        `${entry.id} canvas handle writesTarget ${entry.canvasHandle.writesTarget} does not match a schema target or supported editor command.`,
      );
    }

    if (!entry.canvasHandle.outputObservable.trim()) {
      errors.push(`${entry.id} canvas handle must describe the product output change.`);
    }

    if (entry.browser === false) {
      errors.push(`${entry.id} canvas handle must have browser drag coverage.`);
    }

    if (!entry.automated || !entry.automatedTestName.trim()) {
      errors.push(`${entry.id} canvas handle must have automated output coverage.`);
    }
  }

  return errors;
}

export function getToolcraftCanvasEditingProofErrors({
  acceptance,
  capabilityActive,
  controls,
  productReadiness,
}: Readonly<{
  acceptance: readonly ToolcraftComponentAcceptance[];
  capabilityActive: boolean;
  controls: readonly ToolcraftVisibleControl[];
  productReadiness: ToolcraftProductReadiness;
}>): string[] {
  const handles = acceptance.filter(
    (entry) =>
      entry.kind === "canvas-handle" &&
      entry.componentType !== "orientationGizmo",
  );

  if (!capabilityActive) {
    return handles.map(
      (entry) =>
        `Acceptance "${entry.id}" claims canvas.editing proof but that capability is absent.`,
    );
  }

  if (handles.length === 0) {
    return [
      "canvas.editing requires a canvas-handle acceptance row proving direct manipulation output.",
    ];
  }

  const errors = getToolcraftCanvasHandleAcceptanceErrors({
    acceptance: handles,
    controlTargets: new Set(controls.map(({ control }) => control.target)),
  });
  const ownership =
    productReadiness.mode === "product"
      ? productReadiness.interactionOwnership
      : [];

  for (const handle of handles) {
    const owner = ownership.find(({ id }) => id === handle.interactionId);
    if (
      !owner ||
      owner.surface !== "canvas" ||
      owner.target !== handle.canvasHandle?.writesTarget
    ) {
      errors.push(
        `${handle.id} canvas.editing proof must reference matching canvas interactionOwnership for its writesTarget.`,
      );
    }
  }

  return errors;
}
