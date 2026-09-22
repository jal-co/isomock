import {
  ToolcraftOrientationQuaternion,
  applyOrientationQuaternion,
  crossOrientationVectors,
  dotOrientationVectors,
  getOrientationQuaternionFromAxisAngle,
  getOrientationQuaternionFromBasis,
  getOrientationVectorLength,
  normalizeOrientationVector,
  scaleOrientationVector,
  type ToolcraftOrientationVector,
} from "./orientation-quaternion";
import {
  readToolcraftOrientationPose,
  type ToolcraftOrientationPose,
} from "../../state/orientation-pose";

export { ToolcraftOrientationQuaternion } from "./orientation-quaternion";
export {
  DEFAULT_TOOLCRAFT_ORIENTATION_POSE,
  readToolcraftOrientationPose,
  type ToolcraftOrientationPose,
} from "../../state/orientation-pose";

export type ToolcraftOrientationAxis = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

export type ToolcraftOrientationAxisProjection = {
  axis: ToolcraftOrientationAxis;
  depth: number;
  isFrontFacing: boolean;
  x: number;
  y: number;
};

export const TOOLCRAFT_ORIENTATION_AXES: readonly ToolcraftOrientationAxis[] = [
  "+x",
  "-x",
  "+y",
  "-y",
  "+z",
  "-z",
];

export const TOOLCRAFT_TURNTABLE_RADIANS_PER_PIXEL = Math.PI / 450;
export const TOOLCRAFT_ORIENTATION_SMOOTH_VIEW_MS = 200;

const worldUp: ToolcraftOrientationVector = [0, 1, 0];

const axisVectors: Record<
  ToolcraftOrientationAxis,
  ToolcraftOrientationVector
> = {
  "+x": [1, 0, 0],
  "-x": [-1, 0, 0],
  "+y": [0, 1, 0],
  "-y": [0, -1, 0],
  "+z": [0, 0, 1],
  "-z": [0, 0, -1],
};

export function getToolcraftOrientationRadius(
  pose: ToolcraftOrientationPose,
): number {
  return getOrientationVectorLength(pose.position);
}

function interpolateOrientationVectors(
  start: ToolcraftOrientationVector,
  end: ToolcraftOrientationVector,
  amount: number,
): ToolcraftOrientationVector {
  return [
    start[0] + (end[0] - start[0]) * amount,
    start[1] + (end[1] - start[1]) * amount,
    start[2] + (end[2] - start[2]) * amount,
  ];
}

export function getToolcraftOrientationPoseFromPointerDelta(
  poseValue: ToolcraftOrientationPose,
  deltaX: number,
  deltaY: number,
): ToolcraftOrientationPose {
  const pose = readToolcraftOrientationPose(poseValue);

  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    return pose;
  }

  const cameraQuaternion = getToolcraftOrientationCameraQuaternion(pose);
  const back = normalizeOrientationVector(pose.position);
  const cameraRight = normalizeOrientationVector(
    applyOrientationQuaternion([1, 0, 0], cameraQuaternion),
  );
  const rotatedHorizon = crossOrientationVectors(worldUp, back);
  let pitchAxis = cameraRight;

  if (dotOrientationVectors(rotatedHorizon, rotatedHorizon) > 0.001) {
    const alignedHorizon =
      dotOrientationVectors(rotatedHorizon, cameraRight) < 0
        ? scaleOrientationVector(rotatedHorizon, -1)
        : rotatedHorizon;
    let blend =
      Math.acos(
        Math.max(-1, Math.min(1, dotOrientationVectors(worldUp, back))),
      ) / Math.PI;
    blend = Math.abs(blend - 0.5) * 2;
    blend *= blend;
    pitchAxis = normalizeOrientationVector(
      interpolateOrientationVectors(alignedHorizon, cameraRight, blend),
    );
  }

  const pitch = getOrientationQuaternionFromAxisAngle(
    pitchAxis,
    -deltaY * TOOLCRAFT_TURNTABLE_RADIANS_PER_PIXEL,
  );
  const yaw = getOrientationQuaternionFromAxisAngle(
    worldUp,
    -deltaX * TOOLCRAFT_TURNTABLE_RADIANS_PER_PIXEL,
  );
  const nextCameraQuaternion = yaw
    .multiply(pitch)
    .multiply(cameraQuaternion)
    .normalize();
  const radius = getToolcraftOrientationRadius(pose);

  return {
    position: applyOrientationQuaternion([0, 0, radius], nextCameraQuaternion),
    up: normalizeOrientationVector(
      applyOrientationQuaternion([0, 1, 0], nextCameraQuaternion),
    ),
  };
}

export function getToolcraftOrientationCameraQuaternion(
  poseValue: ToolcraftOrientationPose,
): ToolcraftOrientationQuaternion {
  const pose = readToolcraftOrientationPose(poseValue);
  const back = normalizeOrientationVector(pose.position);
  const right = normalizeOrientationVector(
    crossOrientationVectors(pose.up, back),
  );
  const cameraUp = normalizeOrientationVector(
    crossOrientationVectors(back, right),
  );

  return getOrientationQuaternionFromBasis(right, cameraUp, back);
}

export function projectToolcraftOrientationAxes(
  poseValue: ToolcraftOrientationPose,
  center = 35,
  reach = 24.5,
): ToolcraftOrientationAxisProjection[] {
  const pose = readToolcraftOrientationPose(poseValue);
  const cameraQuaternion = getToolcraftOrientationCameraQuaternion(pose);
  const right = applyOrientationQuaternion([1, 0, 0], cameraQuaternion);
  const up = applyOrientationQuaternion([0, 1, 0], cameraQuaternion);
  const forward = applyOrientationQuaternion([0, 0, -1], cameraQuaternion);

  return TOOLCRAFT_ORIENTATION_AXES.map((axis) => {
    const vector = axisVectors[axis];
    const depth = dotOrientationVectors(vector, forward);

    return {
      axis,
      depth,
      isFrontFacing: depth < 0,
      x: center + dotOrientationVectors(vector, right) * reach,
      y: center - dotOrientationVectors(vector, up) * reach,
    };
  });
}

export function snapToolcraftOrientationPose(
  poseValue: ToolcraftOrientationPose,
  axis: ToolcraftOrientationAxis,
): ToolcraftOrientationPose {
  const radius = getToolcraftOrientationRadius(
    readToolcraftOrientationPose(poseValue),
  );

  switch (axis) {
    case "+x":
      return { position: [radius, 0, 0], up: [0, 1, 0] };
    case "-x":
      return { position: [-radius, 0, 0], up: [0, 1, 0] };
    case "+y":
      return { position: [0, radius, 0], up: [0, 0, -1] };
    case "-y":
      return { position: [0, -radius, 0], up: [0, 0, 1] };
    case "+z":
      return { position: [0, 0, radius], up: [0, 1, 0] };
    case "-z":
      return { position: [0, 0, -radius], up: [0, 1, 0] };
  }
}

export function easeToolcraftOrientationSnap(progress: number): number {
  const value = Math.max(0, Math.min(1, progress));

  return value * value * (3 - 2 * value);
}

export function getToolcraftOrientationSnapDurationMs(
  startValue: ToolcraftOrientationPose,
  endValue: ToolcraftOrientationPose,
): number {
  const start = getToolcraftOrientationCameraQuaternion(startValue);
  const end = getToolcraftOrientationCameraQuaternion(endValue);
  const cosine = Math.abs(
    start.x * end.x + start.y * end.y + start.z * end.z + start.w * end.w,
  );
  const angle = 2 * Math.acos(Math.max(-1, Math.min(1, cosine)));

  return (TOOLCRAFT_ORIENTATION_SMOOTH_VIEW_MS * angle) / Math.PI;
}

export function interpolateToolcraftOrientationPose(
  startValue: ToolcraftOrientationPose,
  endValue: ToolcraftOrientationPose,
  progress: number,
): ToolcraftOrientationPose {
  const start = readToolcraftOrientationPose(startValue);
  const end = readToolcraftOrientationPose(endValue, start);
  const radius = getToolcraftOrientationRadius(start);
  const quaternion = getToolcraftOrientationCameraQuaternion(start).slerp(
    getToolcraftOrientationCameraQuaternion(end),
    Math.max(0, Math.min(1, progress)),
  );

  return {
    position: applyOrientationQuaternion([0, 0, radius], quaternion),
    up: normalizeOrientationVector(
      applyOrientationQuaternion([0, 1, 0], quaternion),
    ),
  };
}
