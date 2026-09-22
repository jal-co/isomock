import { isToolcraftCollectionItemId } from "../schema/collection-identity";
import {
  assertToolcraftWellFormedUnicode,
  toolcraftCollectionItemControlAddressPrefix,
} from "../schema/collection-actions";

export { toolcraftCollectionItemControlAddressPrefix };

export type ToolcraftCollectionItemControlAddress = Readonly<{
  collectionTarget: string;
  fieldId: string;
} & ({ index: number; itemId?: never } | { itemId: string; index?: never })>;

function encodeComponent(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeComponent(value: string): string | null {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return encodeComponent(decoded) === value ? decoded : null;
  } catch {
    return null;
  }
}

export function getToolcraftCollectionItemControlAddress(
  collectionTarget: string,
  identity: number | string,
  fieldId: string,
): string {
  if (!collectionTarget || !fieldId || (typeof identity === "number" ? !Number.isSafeInteger(identity) || identity < 0 : !isToolcraftCollectionItemId(identity))) {
    throw new Error("Toolcraft collection item addresses require non-empty components and a nonnegative safe index.");
  }
  assertToolcraftWellFormedUnicode(
    collectionTarget,
    "Toolcraft collection address target",
  );
  assertToolcraftWellFormedUnicode(
    fieldId,
    "Toolcraft collection address field",
  );
  const part = typeof identity === "string" ? `id-${encodeComponent(identity)}` : String(identity);
  return `${toolcraftCollectionItemControlAddressPrefix}${encodeComponent(collectionTarget)}:${part}:${encodeComponent(fieldId)}`;
}

export function decodeToolcraftCollectionItemControlAddress(
  value: string,
): ToolcraftCollectionItemControlAddress | null {
  if (!value.startsWith(toolcraftCollectionItemControlAddressPrefix)) return null;
  const body = value.slice(toolcraftCollectionItemControlAddressPrefix.length);
  const parts = body.split(":");
  if (parts.length !== 3) return null;
  const [encodedTarget, encodedIndex, encodedField] = parts;
  if (!encodedIndex) return null;
  const itemId = encodedIndex.startsWith("id-") ? decodeComponent(encodedIndex.slice(3)) : null;
  const index = /^(0|[1-9][0-9]*)$/u.test(encodedIndex) ? Number(encodedIndex) : NaN;
  if (!(isToolcraftCollectionItemId(itemId) || Number.isSafeInteger(index))) return null;
  const collectionTarget = decodeComponent(encodedTarget ?? "");
  const fieldId = decodeComponent(encodedField ?? "");
  if (!collectionTarget || !fieldId) return null;
  const decoded = itemId !== null ? { collectionTarget, fieldId, itemId } : { collectionTarget, fieldId, index };
  return getToolcraftCollectionItemControlAddress(collectionTarget, itemId ?? index, fieldId) === value
    ? decoded
    : null;
}
