import type { ToolcraftOrientationPose } from "@/toolcraft/runtime/react";

export const isomockTargets = {
  background: "appearance.background",
  blur: "focus.blur",
  fieldOfView: "camera.fieldOfView",
  focusPoint: "focus.point",
  grain: "finish.grain",
  includeBackground: "export.includeBackground",
  offset: "camera.offset",
  pose: "camera.pose",
  sharpBand: "focus.sharpBand",
  source: "source.screenshot",
  zoom: "camera.zoom",
} as const;

export const isomockDefaults = {
  background: "#0B0B0C",
  blur: 45,
  fieldOfView: 30,
  focusPoint: { x: 0, y: 0 },
  grain: 20,
  offset: { x: 0, y: 0 },
  pose: {
    position: [-2.2, -2.9, 4.3],
    up: [0.28, 0.96, 0],
  } satisfies ToolcraftOrientationPose,
  sharpBand: 0.08,
  zoom: 1.7,
} as const;

export type Vec2 = Readonly<{ x: number; y: number }>;
export type Vec3 = readonly [number, number, number];

export type IsomockSettings = Readonly<{
  blur: number;
  fieldOfView: number;
  focusPoint: Vec2;
  grain: number;
  offset: Vec2;
  pose: Readonly<{ position: Vec3; up: Vec3 }>;
  sharpBand: number;
  zoom: number;
}>;

function readNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readVec2(value: unknown, fallback: Vec2): Vec2 {
  if (typeof value !== "object" || value === null) return fallback;
  const record = value as Record<string, unknown>;
  return { x: readNumber(record.x, fallback.x), y: readNumber(record.y, fallback.y) };
}

function readVec3(value: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  const [x, y, z] = value.map(Number);
  return [x, y, z].every(Number.isFinite) ? [x, y, z] : fallback;
}

export function readIsomockSettings(
  values: Readonly<Record<string, unknown>>,
): IsomockSettings {
  const pose = values[isomockTargets.pose] as Record<string, unknown> | undefined;
  return {
    blur: readNumber(values[isomockTargets.blur], isomockDefaults.blur),
    fieldOfView: readNumber(values[isomockTargets.fieldOfView], isomockDefaults.fieldOfView),
    focusPoint: readVec2(values[isomockTargets.focusPoint], isomockDefaults.focusPoint),
    grain: readNumber(values[isomockTargets.grain], isomockDefaults.grain),
    offset: readVec2(values[isomockTargets.offset], isomockDefaults.offset),
    pose: {
      position: readVec3(pose?.position, isomockDefaults.pose.position),
      up: readVec3(pose?.up, isomockDefaults.pose.up),
    },
    sharpBand: readNumber(values[isomockTargets.sharpBand], isomockDefaults.sharpBand),
    zoom: readNumber(values[isomockTargets.zoom], isomockDefaults.zoom),
  };
}
