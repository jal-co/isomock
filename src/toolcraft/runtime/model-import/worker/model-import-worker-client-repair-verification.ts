import type { ToolcraftModelWorkerRepairSnapshot } from "./model-import-worker-client-snapshot";
import type { ToolcraftModelWorkerAsyncSha256 } from "./model-import-worker-result-verification";

export type ToolcraftModelWorkerRepairInputVerification =
  | "stale"
  | "verified"
  | Readonly<{ code: string; message: string }>;

function failure(code: string, message: string): ToolcraftModelWorkerRepairInputVerification {
  return Object.freeze({ code, message });
}

export async function verifyToolcraftModelWorkerRepairInputs(
  snapshot: ToolcraftModelWorkerRepairSnapshot,
  sha256: ToolcraftModelWorkerAsyncSha256,
  isCurrent: () => boolean,
): Promise<ToolcraftModelWorkerRepairInputVerification> {
  try {
    const canonicalDigest = await sha256(snapshot.canonicalDocument);
    if (!isCurrent()) return "stale";
    if (canonicalDigest !== snapshot.canonicalDocumentDigest) {
      return failure(
        "model-worker-repair-document-digest-mismatch",
        "The model repair document failed cryptographic verification.",
      );
    }
    const envelopeDigest = await sha256(snapshot.repairPlanEnvelope.bytes);
    if (!isCurrent()) return "stale";
    if (envelopeDigest !== snapshot.repairPlanEnvelope.envelopeDigest) {
      return failure(
        "model-worker-repair-envelope-digest-mismatch",
        "The model repair plan failed cryptographic verification.",
      );
    }
    return "verified";
  } catch {
    return isCurrent()
      ? failure(
          "model-worker-repair-verification-failed",
          "The model repair inputs could not be verified.",
        )
      : "stale";
  }
}
