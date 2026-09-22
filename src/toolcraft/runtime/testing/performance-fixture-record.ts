export function createToolcraftFixtureRecord<Value>(
  entries: Iterable<readonly [string, Value]>,
): Record<string, Value> {
  const record = Object.create(null) as Record<string, Value>;
  for (const [key, value] of entries) record[key] = value;
  return record;
}

export function hasOwnToolcraftFixtureKey(
  record: object,
  key: string,
): boolean {
  return Object.hasOwn(record, key);
}
