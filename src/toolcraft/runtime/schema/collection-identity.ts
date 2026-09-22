import type { ToolcraftControlSchema } from "./types";

export function isToolcraftCollectionItemId(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 128) return false;
  // UTF-8 address encoding must never replace a lone surrogate with U+FFFD.
  try { encodeURIComponent(value); return true; } catch { return false; }
}

export function getToolcraftCollectionItemIdentity(control: Pick<ToolcraftControlSchema, "identityField">, item: unknown, index: number): string | number {
  if (!control.identityField) return index;
  const id = item && typeof item === "object" ? (item as Record<string, unknown>)[control.identityField] : undefined;
  if (!isToolcraftCollectionItemId(id)) throw new Error("A keyed collection item requires a valid ID.");
  return id;
}

/** Resolve against current items, never an index remembered by a gesture. */
export function resolveToolcraftCollectionItemIndex(control: Pick<ToolcraftControlSchema, "identityField">, items: readonly unknown[], address: { itemId?: string | null; itemIndex?: number | null }): number {
  if (control.identityField) {
    if (!isToolcraftCollectionItemId(address.itemId) || address.itemIndex !== undefined) return -1;
    return items.findIndex(item => item !== null && typeof item === "object" && (item as Record<string, unknown>)[control.identityField!] === address.itemId);
  }
  const index = address.itemIndex;
  return address.itemId === undefined && typeof index === "number" && Number.isSafeInteger(index) && index >= 0 && index < items.length ? index : -1;
}
