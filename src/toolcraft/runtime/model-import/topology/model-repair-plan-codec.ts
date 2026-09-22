import type { ToolcraftModelRepairPlan } from "./model-repair-plan";
import {
  TOOLCRAFT_MODEL_REPAIR_PLAN_ENVELOPE_MAX_BYTES,
  TOOLCRAFT_MODEL_REPAIR_PLAN_ENVELOPE_VERSION,
} from "./model-repair-plan-envelope";
import {
  validateToolcraftModelRepairPlan,
  type ToolcraftModelRepairPlanValidationOptions,
} from "./model-repair-plan-validation";

const HEADER_BYTES = 16;
const MAGIC = Object.freeze([0x54, 0x43, 0x52, 0x50, 0x4c, 0x41, 0x4e, 0x00]);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

type DecodeOptions = ToolcraftModelRepairPlanValidationOptions & Readonly<{
  maxByteLength?: number;
}>;

function fail(message: string): never {
  throw Object.assign(new Error(message), {
    category: "repair",
    code: "repair-plan-envelope-invalid",
  });
}

function byteLimit(value: number | undefined): number {
  const result = value ?? TOOLCRAFT_MODEL_REPAIR_PLAN_ENVELOPE_MAX_BYTES;
  if (!Number.isSafeInteger(result) || result < HEADER_BYTES ||
      result > TOOLCRAFT_MODEL_REPAIR_PLAN_ENVELOPE_MAX_BYTES) {
    return fail("Repair plan envelope byte limit is invalid.");
  }
  return result;
}

function viewOf(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value);
}

export function encodeToolcraftModelRepairPlanEnvelope(
  plan: ToolcraftModelRepairPlan,
  options: Readonly<{ maxByteLength?: number }> = {},
): Uint8Array<ArrayBuffer> {
  const payload = encoder.encode(JSON.stringify({
    algorithmVersion: plan.algorithmVersion,
    analyzerVersion: plan.analyzerVersion,
    operations: plan.operations,
    planDigest: plan.planDigest,
    profile: plan.profile,
    recipeId: plan.recipeId,
    sourceDocumentDigest: plan.sourceDocumentDigest,
  }));
  const totalByteLength = HEADER_BYTES + payload.byteLength;
  if (totalByteLength > byteLimit(options.maxByteLength)) {
    return fail("Repair plan envelope exceeds its byte limit.");
  }
  const envelope = new Uint8Array(totalByteLength);
  envelope.set(MAGIC, 0);
  const header = new DataView(envelope.buffer);
  header.setUint16(8, TOOLCRAFT_MODEL_REPAIR_PLAN_ENVELOPE_VERSION, true);
  header.setUint16(10, 0, true);
  header.setUint32(12, payload.byteLength, true);
  envelope.set(payload, HEADER_BYTES);
  return envelope;
}

export function decodeToolcraftModelRepairPlanEnvelope(
  value: ArrayBuffer | Uint8Array,
  options: DecodeOptions,
): ToolcraftModelRepairPlan {
  const bytes = viewOf(value);
  const maximum = byteLimit(options.maxByteLength);
  if (bytes.byteLength < HEADER_BYTES || bytes.byteLength > maximum) {
    return fail("Repair plan envelope exceeds its byte limit.");
  }
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (bytes[index] !== MAGIC[index]) {
      return fail("Repair plan envelope framing is invalid.");
    }
  }
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint16(8, true) !== TOOLCRAFT_MODEL_REPAIR_PLAN_ENVELOPE_VERSION ||
      header.getUint16(10, true) !== 0 ||
      header.getUint32(12, true) !== bytes.byteLength - HEADER_BYTES) {
    return fail("Repair plan envelope framing is invalid.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes.subarray(HEADER_BYTES)));
  } catch {
    return fail("Repair plan envelope payload is invalid UTF-8 JSON.");
  }
  return validateToolcraftModelRepairPlan(parsed, options);
}
