import type {
  ResolvedModuleOrigin,
  ResolvedProductModulePlan,
  ToolcraftProductCapabilityId,
  ToolcraftProductModuleId,
} from "@/toolcraft/runtime";

const moduleIdByCapability = {
  "artifact.image-export": "image-export",
  "artifact.svg-export": "svg-export",
  "artifact.video-export": "video-export",
  "canvas.editing": "canvas-editing",
  "foreground.soft-ellipses": "masks",
  "layers.management": "layers",
  "media.source": "media-source",
  "model.3d": "model-3d",
  "spatial.view": "spatial-view",
  "timeline.keyframes": "timeline",
  "timeline.playback": "timeline",
} as const satisfies Record<
  ToolcraftProductCapabilityId,
  ToolcraftProductModuleId
>;

const requiredCapabilitiesByModule = {
  "canvas-editing": [],
  "image-export": [],
  layers: [],
  masks: [],
  "media-source": [],
  "model-3d": ["media.source"],
  "spatial-view": [],
  "svg-export": [],
  timeline: [],
  "video-export": ["timeline.playback"],
} as const satisfies Record<
  ToolcraftProductModuleId,
  readonly ToolcraftProductCapabilityId[]
>;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function freezeRecursively<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) freezeRecursively(item);
    return Object.freeze(value) as T;
  }

  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freezeRecursively(item);
    return Object.freeze(value);
  }

  return value;
}

export function createResolvedProductModulePlanFixture(
  capabilities: readonly ToolcraftProductCapabilityId[],
  origins: Readonly<
    Partial<Record<ToolcraftProductCapabilityId, ResolvedModuleOrigin>>
  > = {},
): ResolvedProductModulePlan {
  const sortedCapabilities = [...new Set(capabilities)].sort(compareCodeUnits);
  const moduleIds = [
    ...new Set(sortedCapabilities.map((capability) => moduleIdByCapability[capability])),
  ].sort(compareCodeUnits);

  return freezeRecursively({
    capabilities: sortedCapabilities.map((capabilityId) => ({
      capabilityId,
      moduleId: moduleIdByCapability[capabilityId],
    })),
    modules: moduleIds.map((id) => {
      const provides = sortedCapabilities.filter(
        (capabilityId) => moduleIdByCapability[capabilityId] === id,
      );
      const origin = provides.every(
        (capabilityId) => origins[capabilityId] === "default-provider",
      )
        ? "default-provider"
        : "explicit";

      return {
        id,
        origin,
        provides,
        requestedBy: [],
        requires: requiredCapabilitiesByModule[id],
      };
    }),
    ownership: [],
    portRequirements: [],
  } satisfies ResolvedProductModulePlan);
}
