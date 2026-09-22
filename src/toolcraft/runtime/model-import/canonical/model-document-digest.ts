import type { ToolcraftModelImportLimits } from "../../schema/types";
import type { ToolcraftModelDocument } from "./model-document";
import { encodeToolcraftModelDocument } from "./model-document-codec";
import { bytesToHex, sha256 } from "./sha256";

export function digestToolcraftModelDocument(
  document: ToolcraftModelDocument,
  limits?: Partial<ToolcraftModelImportLimits>,
): string {
  const canonicalBytes = encodeToolcraftModelDocument(document, limits);
  return `sha256:${bytesToHex(sha256(canonicalBytes))}`;
}

