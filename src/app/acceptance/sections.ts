export function getToolcraftSectionLabel(
  sectionTitle: string | undefined,
  sectionIndex: number,
): string {
  return sectionTitle?.trim() || `untitled section ${sectionIndex + 1}`;
}
