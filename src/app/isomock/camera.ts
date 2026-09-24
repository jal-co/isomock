import type { IsomockSettings, Vec2, Vec3 } from "./settings";

export type IsomockCamera = Readonly<{
  aspect: number;
  focusDepth: number;
  forward: Vec3;
  imageWidth: number;
  position: Vec3;
  right: Vec3;
  tanHalf: number;
  up: Vec3;
}>;

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const normalize = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(...a) || 1));

export function getIsomockFrameScale(
  zoom: number,
  imageAspect: number,
  frameAspect: number,
): number {
  return zoom / (2 * Math.max(0.5, imageAspect / 2 / frameAspect));
}

export function createIsomockCamera(
  settings: IsomockSettings,
  imageAspect: number,
  frameAspect: number,
): IsomockCamera {
  const back = normalize(settings.pose.position);
  const right = normalize(cross(settings.pose.up, back));
  const up = cross(back, right);
  const forward = scale(back, -1);
  const tanHalf = Math.tan((settings.fieldOfView * Math.PI) / 360);
  const fitHalfHeight = Math.max(0.5, imageAspect / 2 / frameAspect);
  const distance = fitHalfHeight / tanHalf / settings.zoom;
  const target = add(
    scale(right, -settings.offset.x),
    scale(up, settings.offset.y),
  );
  const position = add(target, scale(back, distance));
  const focusPoint: Vec3 = [
    (settings.focusPoint.x * imageAspect) / 2,
    -settings.focusPoint.y / 2,
    0,
  ];
  return {
    aspect: frameAspect,
    focusDepth: dot(add(focusPoint, scale(position, -1)), forward),
    forward,
    imageWidth: imageAspect,
    position,
    right,
    tanHalf,
    up,
  };
}

export function projectIsomockRay(
  camera: IsomockCamera,
  ndcX: number,
  ndcY: number,
): Readonly<{ depth: number; u: number; v: number }> | null {
  const direction = add(
    camera.forward,
    add(
      scale(camera.right, ndcX * camera.tanHalf * camera.aspect),
      scale(camera.up, ndcY * camera.tanHalf),
    ),
  );
  if (Math.abs(direction[2]) < 1e-9) return null;
  const depth = -camera.position[2] / direction[2];
  if (depth <= 0) return null;
  const hit = add(camera.position, scale(direction, depth));
  return { depth, u: hit[0] / camera.imageWidth + 0.5, v: 0.5 - hit[1] };
}

export function isomockRayHitsImage(
  camera: IsomockCamera,
  ndcX: number,
  ndcY: number,
): boolean {
  const hit = projectIsomockRay(camera, ndcX, ndcY);
  return !!hit && hit.u >= 0 && hit.u <= 1 && hit.v >= 0 && hit.v <= 1;
}

export function getIsomockFrameCenterFocus(camera: IsomockCamera): Vec2 {
  const hit = projectIsomockRay(camera, 0, 0);
  if (!hit) return { x: 0, y: 0 };
  const clampUnit = (value: number) => Math.min(1, Math.max(0, value));
  return { x: clampUnit(hit.u) * 2 - 1, y: clampUnit(hit.v) * 2 - 1 };
}
