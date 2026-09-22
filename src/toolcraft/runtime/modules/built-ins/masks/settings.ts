import type { ToolcraftControlSchema, ToolcraftControlSectionSchema, ResolvedToolcraftControlSectionSchema } from "../../../schema/types";
import { TOOLCRAFT_MAX_MASKS, toolcraftMaskTargets, type ToolcraftMasksModuleOptions } from "./contracts";

const guideDescription = "Show editing guides without changing the masked output.";

/** Keep one authored schema; the embedded canvas owns these spatial operations. */
export function withToolcraftMaskCanvasInteraction(section: ResolvedToolcraftControlSectionSchema): ResolvedToolcraftControlSectionSchema {
  return { ...section, controls: Object.fromEntries(Object.entries(section.controls).map(([id, control]) => {
    if (control.target === toolcraftMaskTargets.show) return [id, { ...control, disabled: false, description: guideDescription }];
    if (control.target !== toolcraftMaskTargets.items || !control.itemControls) return [id, control];
    return [id, { ...control, itemControls: Object.fromEntries(Object.entries(control.itemControls).map(([field, value]) => [field,
      ['position', 'radius', 'stretch', 'rotation'].includes(field)
        ? { ...value, disabled: true, description: "Edit this value using the selected mask's canvas handles." } : value,
    ])) }];
  })) };
}

export function createToolcraftMasksSettings(options: ToolcraftMasksModuleOptions = {}): Omit<ToolcraftControlSectionSchema, "id"> & { title: string; layoutGroups: [] } {
  const spatial = { disabled: options.spatialFields === "read-only", description: options.spatialFields === "read-only" ? "Edit this value using the selected mask's canvas handles." : undefined };
  return {
    title: "Masks",
    layout: "standalone",
    layoutGroups: [],
    controls: {
      apply: { type: "switch", target: toolcraftMaskTargets.apply, label: "Apply", defaultValue: false, applicability: { mode: "always" } },
      show: { type: "switch", target: toolcraftMaskTargets.show, label: "Show guides", defaultValue: false, disabled: options.guideSurface !== "canvas", description: options.guideSurface === "canvas" ? guideDescription : "Canvas guides are unavailable in this view.", applicability: { mode: "always" } },
      items: {
        type: "collectionActions", target: toolcraftMaskTargets.items, label: "Masks", itemLabel: "Mask", identityField: "id", selectionTarget: toolcraftMaskTargets.selection,
        defaultValue: [], minItems: 0, hardMaxItems: TOOLCRAFT_MAX_MASKS, applicability: { mode: "always" },
        itemControls: {
          position: { type: "vector", label: "Position", coordinateMode: "cartesian", defaultValue: { x: 0, y: 0 }, ...spatial },
          radius: { type: "slider", label: "Radius", unit: "%", defaultValue: 30, min: 0.01, max: 1000, step: 0.5, ...spatial },
          stretch: { type: "slider", label: "Stretch", defaultValue: 1, min: 0.01, max: 100, step: 0.01, ...spatial },
          rotation: { type: "slider", label: "Rotation", unit: "°", defaultValue: 0, min: -360, max: 360, step: 0.5, ...spatial },
          feather: { type: "slider", label: "Feather", unit: "%", defaultValue: 20, min: 0, max: 100, step: 1 },
          opacity: { type: "slider", label: "Opacity", unit: "%", defaultValue: 100, min: 0, max: 100, step: 1 },
          enabled: { type: "switch", label: "Active", defaultValue: true },
          edgeMetric: { type: "select", label: "Edge metric", defaultValue: "ellipse-distance", disabled: true, description: "Preserves the falloff of imported masks.", options: [{ label: "Ellipse distance", value: "ellipse-distance" }, { label: "Normalized radius", value: "normalized-radius" }] },
        },
      } satisfies ToolcraftControlSchema,
    },
  };
}
