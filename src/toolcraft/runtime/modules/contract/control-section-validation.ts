export function hasCanonicalControlRoles(
  controls: Readonly<Record<string, Readonly<{ performanceRole?: string; }>>> | undefined,
  expected: Readonly<Record<string, string>>,
): boolean {
  return controls !== undefined && Object.keys(controls).length === Object.keys(expected).length &&
    Object.entries(expected).every(([id, role]) => controls[id]?.performanceRole === role);
}
