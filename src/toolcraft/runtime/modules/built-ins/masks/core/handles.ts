import type { ToolcraftExternalHandle, ToolcraftExternalPoint } from "../../../../schema/external-interaction";
import type { EvaluatedToolcraftSoftEllipse, ToolcraftMaskReferenceFrame, ToolcraftMaskItem } from "../contracts";

export type ToolcraftMaskHandleOperation = "move" | "radius" | "stretch" | "rotate";
export function maskHandleId(id: string, operation: ToolcraftMaskHandleOperation): string {
  return `${id}:${operation}`;
}
export function maskHandles(ellipse: EvaluatedToolcraftSoftEllipse): readonly ToolcraftExternalHandle[] {
  const angle = ellipse.rotationDegrees * Math.PI / 180;
  const point = (x: number, y: number) => ({ x: ellipse.center.x + x * Math.cos(angle) - y * Math.sin(angle), y: ellipse.center.y + x * Math.sin(angle) + y * Math.cos(angle) });
  return [
    { id: maskHandleId(ellipse.id, "move"), kind: "point", point: ellipse.center, label: "Move mask", cursor: "move" },
    { id: maskHandleId(ellipse.id, "radius"), kind: "radius", point: point(ellipse.radiusX, 0), label: "Mask radius", cursor: "ew-resize" },
    { id: maskHandleId(ellipse.id, "stretch"), kind: "radius", point: point(0, ellipse.radiusY), label: "Mask stretch", cursor: "ns-resize" },
    { id: maskHandleId(ellipse.id, "rotate"), kind: "rotation", point: point(0, -ellipse.radiusY - 24), label: "Rotate mask", cursor: "grab" },
  ];
}

/** Absolute pointer movement is evaluated against the gesture's starting ellipse. */
export function maskHandleValue(
  operation: ToolcraftMaskHandleOperation,
  item: ToolcraftMaskItem,
  ellipse: EvaluatedToolcraftSoftEllipse,
  reference: ToolcraftMaskReferenceFrame,
  start: ToolcraftExternalPoint,
  point: ToolcraftExternalPoint,
): { field: "position" | "radius" | "stretch" | "rotation"; value: number | ToolcraftExternalPoint } {
  if (![point.x, point.y, start.x, start.y].every(Number.isFinite)) throw new Error("Invalid mask handle point.");
  if (operation === "move") return { field: "position", value: {
    x: item.position.x + (point.x - start.x) * 2 / reference.width,
    y: item.position.y - (point.y - start.y) * 2 / reference.height,
  } };
  const angle = ellipse.rotationDegrees * Math.PI / 180;
  const x = point.x - ellipse.center.x, y = point.y - ellipse.center.y;
  const dx = point.x - start.x, dy = point.y - start.y;
  if (operation === "radius") return { field: "radius", value: Math.max(0.01, item.radius + (dx * Math.cos(angle) + dy * Math.sin(angle)) * 100 / reference.height) };
  if (operation === "stretch") return { field: "stretch", value: Math.max(0.01, item.stretch + (-dx * Math.sin(angle) + dy * Math.cos(angle)) / ellipse.radiusX) };
  const initialAngle = Math.atan2(start.y - ellipse.center.y, start.x - ellipse.center.x);
  const delta = Math.atan2(Math.sin(Math.atan2(y, x) - initialAngle), Math.cos(Math.atan2(y, x) - initialAngle));
  const degrees = item.rotation + delta * 180 / Math.PI;
  return { field: "rotation", value: ((degrees + 180) % 360 + 360) % 360 - 180 };
}
