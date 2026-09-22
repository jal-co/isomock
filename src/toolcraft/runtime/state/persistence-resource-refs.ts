import { collectToolcraftMediaResourceRefs } from "../source-assets/repository/resource-reachability";
import { isToolcraftPersistenceRecord } from "./persistence-shared";

type PersistenceReadStorage = Pick<Storage, "getItem" | "key" | "length">;

function readStorageKeys(storage: PersistenceReadStorage): string[] | null {
  const length = storage.length;
  const keys = new Set<string>();
  for (let index = 0; index < length; index += 1) {
    const key = storage.key(index);
    if (key === null || keys.has(key)) return null;
    keys.add(key);
  }
  return storage.length === length ? [...keys].sort() : null;
}

function readPayloadResourceRefs(raw: string): ReadonlySet<string> {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Set();
  }
  if (
    !isToolcraftPersistenceRecord(payload) ||
    !Number.isInteger(payload.version) ||
    typeof payload.version !== "number" || payload.version < 1 ||
    !isToolcraftPersistenceRecord(payload.state)
  ) return new Set();
  return collectToolcraftMediaResourceRefs(payload.state.mediaAssets);
}

/**
 * The saved JSON is the durable owner; there is no second manifest to synchronize.
 * Keys are not namespaced here: custom keys and closed apps share the binary DB.
 * This conservative scan does not make cross-tab localStorage writes atomic.
 */
export function readToolcraftPersistedResourceRefs(
  getStorage: () => PersistenceReadStorage,
): ReadonlySet<string> | null {
  try {
    const storage = getStorage();
    const keys = readStorageKeys(storage);
    if (!keys) return null;
    const values = new Map<string, string>();
    const refs = new Set<string>();
    for (const key of keys) {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      values.set(key, raw);
      for (const ref of readPayloadResourceRefs(raw)) refs.add(ref);
    }
    const finalKeys = readStorageKeys(storage);
    if (!finalKeys || finalKeys.length !== keys.length ||
      finalKeys.some((key, index) => key !== keys[index])) return null;
    // Detect concurrent changes observed during enumeration, not a partial root set.
    for (const [key, value] of values) {
      if (storage.getItem(key) !== value) return null;
    }
    return refs;
  } catch {
    // Includes a denied window.localStorage getter, key enumeration and reads.
    return null;
  }
}
