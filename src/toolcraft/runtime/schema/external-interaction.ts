/** Neutral interaction schema shared by module implementations and host composition. */
export type ToolcraftExternalPoint = Readonly<{ x: number; y: number }>;
export type ToolcraftExternalHandle = Readonly<{
  id: string;
  kind: "point" | "radius" | "rotation";
  point: ToolcraftExternalPoint;
  label: string;
  cursor?: "move" | "crosshair" | "grab" | "ew-resize" | "ns-resize" | "nwse-resize" | "nesw-resize";
}>;
export type ToolcraftExternalGuide = Readonly<{
  id: string; center: ToolcraftExternalPoint;
  radiusX: number; radiusY: number; rotationDegrees: number;
}>;
export type ToolcraftExternalInteractionEvent = Readonly<{
  phase: "begin" | "update" | "end" | "cancel";
  gestureId: string; handleId: string; point: ToolcraftExternalPoint; sequence: number;
}>;
export type ToolcraftExternalInteractionSnapshot<Preview> = Readonly<{
  handles: readonly ToolcraftExternalHandle[];
  guides: readonly ToolcraftExternalGuide[];
  preview: Preview | null;
}>;
export type ToolcraftExternalInteractionPort<Preview> = Readonly<{
  getSnapshot(): ToolcraftExternalInteractionSnapshot<Preview>;
  subscribe(changed: () => void): () => void;
  dispatch(event: ToolcraftExternalInteractionEvent): void;
  dispose(): void;
}>;
