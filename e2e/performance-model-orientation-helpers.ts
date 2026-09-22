export type ToolcraftBrowserOrientationPose = Readonly<{
  position: [number, number, number];
  up: [number, number, number];
}>;

type Vector3 = [number, number, number];

function normalize(vector: Vector3): Vector3 {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length) as Vector3;
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

export function getToolcraftPositiveZAxisScreenPoint(
  pose: ToolcraftBrowserOrientationPose,
  bounds: Readonly<{ height: number; width: number; x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  const back = normalize(pose.position);
  const cameraRight = normalize(cross(pose.up, back));
  const cameraUp = normalize(cross(back, cameraRight));
  const localX = 35 + cameraRight[2] * 24.5;
  const localY = 35 - cameraUp[2] * 24.5;
  return Object.freeze({
    x: bounds.x + (localX / 70) * bounds.width,
    y: bounds.y + (localY / 70) * bounds.height,
  });
}
