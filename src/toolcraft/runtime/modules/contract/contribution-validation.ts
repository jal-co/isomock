function rejectMalformedContribution(id: string): never {
  throw new Error(
    `Invalid Toolcraft module contribution "${id}": payload does not match its closed contract.`,
  );
}
export function requireValidContribution(id: string, valid: boolean): void {
  if (!valid) rejectMalformedContribution(id);
}
export function hasExactTuple(
  values: readonly string[] | undefined,
  expected: readonly string[],
): boolean {
  return Array.isArray(values) &&
    values.length === expected.length &&
    values.every((value, index) => value === expected[index]);
}
