import {
  readToolcraftOrientationPose,
  type ToolcraftOrientationPose,
  type useToolcraftEvaluatedValues,
} from "@/toolcraft/runtime/react";

export const isomockTargets = {
  aberration: "finish.aberration",
  background: "appearance.background",
  blur: "focus.blur",
  edgeExtend: "finish.edgeExtend",
  edgeFade: "finish.edgeFade",
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
  aberration: 0,
  background: "#0B0B0C",
  blur: 45,
  edgeExtend: 0,
  edgeFade: 0,
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
  aberration: number;
  blur: number;
  edgeExtend: number;
  edgeFade: number;
  fieldOfView: number;
  focusPoint: Vec2;
  grain: number;
  offset: Vec2;
  pose: ToolcraftOrientationPose;
  sharpBand: number;
  zoom: number;
}>;

export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function readIsomockSettings(
  values: ReturnType<typeof useToolcraftEvaluatedValues>,
): IsomockSettings {
  const number = (target: string, fallback: number) =>
    finiteOr(Number(values[target]), fallback);
  const vec2 = (target: string, fallback: Vec2): Vec2 => {
    const value = values[target];
    if (!(value instanceof Object) || !("x" in value) || !("y" in value))
      return fallback;
    return {
      x: finiteOr(Number(value.x), fallback.x),
      y: finiteOr(Number(value.y), fallback.y),
    };
  };
  return {
    aberration: number(isomockTargets.aberration, isomockDefaults.aberration),
    blur: number(isomockTargets.blur, isomockDefaults.blur),
    edgeExtend: number(isomockTargets.edgeExtend, isomockDefaults.edgeExtend),
    edgeFade: number(isomockTargets.edgeFade, isomockDefaults.edgeFade),
    fieldOfView: number(
      isomockTargets.fieldOfView,
      isomockDefaults.fieldOfView,
    ),
    focusPoint: vec2(isomockTargets.focusPoint, isomockDefaults.focusPoint),
    grain: number(isomockTargets.grain, isomockDefaults.grain),
    offset: vec2(isomockTargets.offset, isomockDefaults.offset),
    pose: readToolcraftOrientationPose(
      values[isomockTargets.pose],
      isomockDefaults.pose,
    ),
    sharpBand: number(isomockTargets.sharpBand, isomockDefaults.sharpBand),
    zoom: number(isomockTargets.zoom, isomockDefaults.zoom),
  };
}
