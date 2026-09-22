import type { ResolvedToolcraftControlSchema } from "@/toolcraft/runtime";

export function getToolcraftColorRowGroupingErrors({
  controls,
  sectionLabel,
}: {
  controls: readonly [string, ResolvedToolcraftControlSchema][];
  sectionLabel: string;
}): string[] {
  const plainColors = controls.filter(
    ([, control]) => control.type === "color",
  );
  const isColorOnlySection =
    controls.length > 0 &&
    controls.every(
      ([, control]) =>
        control.type === "color" || control.type === "colorOpacity",
    );

  if (isColorOnlySection || plainColors.length < 2) {
    return [];
  }

  const missingSemanticGroups = plainColors
    .filter(([, control]) => !control.semanticGroup?.trim())
    .map(([controlId]) => controlId);

  return missingSemanticGroups.length === 0
    ? []
    : [
        `${sectionLabel} has multiple plain Color controls in a mixed section and must declare semanticGroup for every plain Color so runtime rows follow product meaning instead of schema adjacency. Missing: ${missingSemanticGroups.join(", ")}.`,
      ];
}
