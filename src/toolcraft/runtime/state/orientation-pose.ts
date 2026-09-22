export type ToolcraftOrientationPose = Readonly<{
  position: readonly [number, number, number];
  up: readonly [number, number, number];
}>;

export const DEFAULT_TOOLCRAFT_ORIENTATION_POSE: ToolcraftOrientationPose = {
  position: [0, 0, 5],
  up: [0, 1, 0],
};

const minimumLengthSquared = 1e-12;

function clonePose(
  pose: ToolcraftOrientationPose,
): ToolcraftOrientationPose {
  return {
    position: [...pose.position],
    up: [...pose.up],
  };
}

function readFiniteTuple(value: unknown): [number, number, number] | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  ) {
    return null;
  }

  return [value[0], value[1], value[2]];
}

function isUsablePose(pose: ToolcraftOrientationPose): boolean {
  const squaredLength = (value: readonly [number, number, number]) =>
    value[0] * value[0] + value[1] * value[1] + value[2] * value[2];
  const cross: [number, number, number] = [
    pose.up[1] * pose.position[2] - pose.up[2] * pose.position[1],
    pose.up[2] * pose.position[0] - pose.up[0] * pose.position[2],
    pose.up[0] * pose.position[1] - pose.up[1] * pose.position[0],
  ];

  return (
    squaredLength(pose.position) > minimumLengthSquared &&
    squaredLength(pose.up) > minimumLengthSquared &&
    squaredLength(cross) > minimumLengthSquared
  );
}

export function decodeToolcraftOrientationPose(
  value: unknown,
): ToolcraftOrientationPose | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const position = readFiniteTuple(record.position);
  const up = readFiniteTuple(record.up);

  if (!position || !up) {
    return null;
  }

  const pose = { position, up };
  return isUsablePose(pose) ? clonePose(pose) : null;
}

export function readToolcraftOrientationPose(
  value: unknown,
  fallback: ToolcraftOrientationPose = DEFAULT_TOOLCRAFT_ORIENTATION_POSE,
): ToolcraftOrientationPose {
  return (
    decodeToolcraftOrientationPose(value) ??
    decodeToolcraftOrientationPose(fallback) ??
    clonePose(DEFAULT_TOOLCRAFT_ORIENTATION_POSE)
  );
}
