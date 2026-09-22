type VectorControlSource = Readonly<{
  type: string;
  variant?: string;
  coordinateMode?: string;
  xLabel?: string;
  yLabel?: string;
  itemControl?: VectorControlSource;
  itemControls?: Readonly<Record<string, VectorControlSource>>;
}>;

const semanticColorVariants = new Set([
  "whiteBalance",
  "colorBalance",
  "toneBias",
]);

export function isToolcraftSpatialVectorVariant(variant?: string): boolean {
  return !semanticColorVariants.has(variant ?? "default");
}

export function requiresToolcraftVectorScreenMotion(
  control: VectorControlSource,
): boolean {
  return (
    (control.type === "vector" &&
      control.xLabel !== "Width" &&
      control.yLabel !== "Height" &&
      isToolcraftSpatialVectorVariant(control.variant)) ||
    (control.itemControl !== undefined &&
      requiresToolcraftVectorScreenMotion(control.itemControl)) ||
    Object.values(control.itemControls ?? {}).some(
      requiresToolcraftVectorScreenMotion,
    )
  );
}
