const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const DOCUMENT_REF_PATTERN =
  /^toolcraft:model-document:(sha256:[0-9a-f]{64})$/u;
const REPAIR_PLAN_REF_PATTERN =
  /^toolcraft:model-repair-plan:(sha256:[0-9a-f]{64}):(sha256:[0-9a-f]{64})$/u;

export const TOOLCRAFT_MODEL_DOCUMENT_CONTENT_TYPE =
  "application/vnd.toolcraft.model-document";
export const TOOLCRAFT_MODEL_REPAIR_PLAN_CONTENT_TYPE =
  "application/vnd.toolcraft.model-repair-plan.v1";

export {
  createToolcraftModelAppearanceResourceRef,
  parseToolcraftModelAppearanceResourceRef,
} from "./canonical/model-appearance-resource";

function assertDigest(value: string, label: string): void {
  if (!SHA256_DIGEST_PATTERN.test(value)) {
    throw new Error(`${label} must be a SHA-256 digest.`);
  }
}

export function createToolcraftModelDocumentResourceRef(
  documentDigest: string,
): string {
  assertDigest(documentDigest, "Model document digest");
  return `toolcraft:model-document:${documentDigest}`;
}

export function parseToolcraftModelDocumentResourceRef(
  ref: string,
): string | null {
  return DOCUMENT_REF_PATTERN.exec(ref)?.[1] ?? null;
}

export function createToolcraftModelRepairPlanResourceRef({
  envelopeDigest,
  planDigest,
}: Readonly<{
  envelopeDigest: string;
  planDigest: string;
}>): string {
  assertDigest(envelopeDigest, "Model repair envelope digest");
  assertDigest(planDigest, "Model repair plan digest");
  return `toolcraft:model-repair-plan:${planDigest}:${envelopeDigest}`;
}

export function parseToolcraftModelRepairPlanResourceRef(
  ref: string,
): Readonly<{ envelopeDigest: string; planDigest: string }> | null {
  const match = REPAIR_PLAN_REF_PATTERN.exec(ref);
  if (!match?.[1] || !match[2]) return null;
  return Object.freeze({ envelopeDigest: match[2], planDigest: match[1] });
}
