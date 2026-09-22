const toolcraftFixtureComparisonUlps = 8;

export function areToolcraftFixtureValuesEqual(
  left: number,
  right: number,
): boolean {
  if (left === right) return true;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;

  const scale = Math.max(Math.abs(left), Math.abs(right));
  const ulp = Math.max(Number.MIN_VALUE, Number.EPSILON * scale);
  return Math.abs(left - right) <= toolcraftFixtureComparisonUlps * ulp;
}

export function isToolcraftFixtureValueWithinRange(
  value: number,
  minimum: number,
  maximum: number,
): boolean {
  return (
    (value > minimum || areToolcraftFixtureValuesEqual(value, minimum)) &&
    (value < maximum || areToolcraftFixtureValuesEqual(value, maximum))
  );
}
