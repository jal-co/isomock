import { getToolcraftMaskSupport } from "./numerics";
import { decodeToolcraftBuiltInControlValue } from "../../../../state/control-value-codecs";
import { evaluateToolcraftTimelineValue } from "../../../../state/keyframe-evaluation";
import type { ReadonlyToolcraftState } from "../../../../state/readonly-state";
import { createToolcraftMasksSettings } from "../settings";
import { toolcraftMaskTargets, type EvaluatedToolcraftMasks, type ToolcraftMaskItem, type ToolcraftMaskReferenceFrame } from "../contracts";

const itemControl = createToolcraftMasksSettings().controls.items!;

export function readToolcraftMaskItems(value: unknown): readonly ToolcraftMaskItem[] {
  const result = decodeToolcraftBuiltInControlValue(itemControl, value);
  if (!result?.accepted) throw new Error("Invalid soft ellipse masks: expected at most 16 uniquely identified canonical items.");
  return result.value as ToolcraftMaskItem[];
}

/** Converts authored signed positions and percentages exactly once against the stable reference frame. */
export function evaluateToolcraftMasks(values: Readonly<Record<string, unknown>>, reference: ToolcraftMaskReferenceFrame): EvaluatedToolcraftMasks {
  if (![reference.x, reference.y, reference.width, reference.height].every(Number.isFinite) || reference.width <= 0 || reference.height <= 0) throw new Error("Masks require a finite, positive stable reference frame.");
  const enabled = values[toolcraftMaskTargets.apply];
  if (typeof enabled !== "boolean") throw new Error("Masks Apply requires a boolean.");
  const items = readToolcraftMaskItems(values[toolcraftMaskTargets.items]);
  return {
    version: 1, enabled,
    items: items.map(item => {
      const radiusX = item.radius * reference.height / 100;
      const evaluated = {
        id: item.id, enabled: item.enabled,
        center: { x: reference.x + (item.position.x + 1) * reference.width / 2, y: reference.y + (1 - item.position.y) * reference.height / 2 },
        radiusX, radiusY: radiusX * item.stretch, rotationDegrees: item.rotation, opacity: item.opacity / 100,
        edge: { metric: item.edgeMetric, width: item.edgeMetric === "ellipse-distance" ? Math.max(radiusX * item.feather / 100, 0.75) : item.feather / 100 },
      };
      getToolcraftMaskSupport(evaluated);
      return evaluated;
    }),
  };
}

/** Rendering consumers use the same timeline-evaluated values as controls/handles. */
export function getToolcraftEvaluatedMasks(state: ReadonlyToolcraftState, reference: ToolcraftMaskReferenceFrame, timeSeconds?: number): EvaluatedToolcraftMasks {
  return evaluateToolcraftMasks({
    [toolcraftMaskTargets.apply]: evaluateToolcraftTimelineValue(state, toolcraftMaskTargets.apply, timeSeconds),
    [toolcraftMaskTargets.items]: evaluateToolcraftTimelineValue(state, toolcraftMaskTargets.items, timeSeconds),
  }, reference);
}
