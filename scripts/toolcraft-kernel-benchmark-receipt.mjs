import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const TOOLCRAFT_KERNEL_BENCHMARK_RECEIPT_VERSION = 1;

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueSortedStrings(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) => typeof entry === "string" && entry.length > 0 && entry.trim() === entry,
    ) &&
    new Set(value).size === value.length &&
    value.every(
      (entry, index) => index === 0 || compareCodeUnits(value[index - 1], entry) < 0,
    )
  );
}

function normalizeWorkload(workload) {
  if (!isRecord(workload)) {
    throw new Error("Toolcraft kernel benchmark workload must be an object.");
  }
  const entries = Object.entries(workload).sort(([left], [right]) =>
    compareCodeUnits(left, right),
  );
  if (
    entries.some(
      ([key, value]) =>
        key.length === 0 ||
        key.trim() !== key ||
        typeof value !== "number" ||
        !Number.isFinite(value),
    )
  ) {
    throw new Error(
      "Toolcraft kernel benchmark workload keys must be trimmed and values finite.",
    );
  }
  return Object.freeze(Object.fromEntries(entries));
}

export function createToolcraftKernelBenchmarkRequirements({
  decisions,
  requirements,
}) {
  if (!Array.isArray(decisions) || !Array.isArray(requirements)) {
    throw new Error("Toolcraft kernel benchmark decisions and requirements must be arrays.");
  }
  const requirementsByPassId = new Map();
  for (const requirement of requirements) {
    if (
      !isRecord(requirement) ||
      typeof requirement.passId !== "string" ||
      requirement.passId.length === 0 ||
      requirementsByPassId.has(requirement.passId)
    ) {
      throw new Error(
        "Toolcraft kernel benchmark requirements must have unique non-empty pass ids.",
      );
    }
    requirementsByPassId.set(requirement.passId, requirement);
  }

  const normalized = decisions.map((decision) => {
    if (
      !isRecord(decision) ||
      typeof decision.id !== "string" ||
      decision.id.length === 0 ||
      typeof decision.selected !== "string" ||
      !Array.isArray(decision.candidates)
    ) {
      throw new Error("Toolcraft kernel benchmark decision is malformed.");
    }
    const requirement = requirementsByPassId.get(decision.id);
    if (!requirement) {
      throw new Error(
        `Toolcraft kernel benchmark decision "${decision.id}" has no derived requirement.`,
      );
    }
    const candidates = [...decision.candidates].sort(compareCodeUnits);
    if (!uniqueSortedStrings(candidates)) {
      throw new Error(
        `Toolcraft kernel benchmark decision "${decision.id}" candidates must be unique strings.`,
      );
    }
    const requiredCandidates = [...(requirement.candidates ?? [])].sort(compareCodeUnits);
    if (JSON.stringify(candidates) !== JSON.stringify(requiredCandidates)) {
      throw new Error(
        `Toolcraft kernel benchmark decision "${decision.id}" candidates do not match the derived requirement.`,
      );
    }
    if (!candidates.includes(decision.selected)) {
      throw new Error(
        `Toolcraft kernel benchmark decision "${decision.id}" selected candidate is not declared.`,
      );
    }
    return Object.freeze({
      candidates: Object.freeze(candidates),
      passId: decision.id,
      selected: decision.selected,
      workload: normalizeWorkload(requirement.workload),
    });
  });
  const passIds = normalized.map(({ passId }) => passId);
  if (new Set(passIds).size !== passIds.length) {
    throw new Error("Toolcraft kernel benchmark decisions must have unique pass ids.");
  }
  if (normalized.length !== requirements.length) {
    throw new Error(
      "Toolcraft kernel benchmark decisions must resolve every derived requirement exactly once.",
    );
  }
  return Object.freeze(
    normalized.sort((left, right) => compareCodeUnits(left.passId, right.passId)),
  );
}

export function getToolcraftKernelBenchmarkRequirementHash(requirements) {
  return hashJson(requirements);
}

export function getToolcraftKernelBenchmarkReceiptPath(rootDir) {
  return path.join(rootDir, ".toolcraft", "verification", "kernel-benchmarks.json");
}

function getBenchmarkError(benchmark, requirement) {
  if (
    !isRecord(benchmark) ||
    benchmark.passId !== requirement.passId ||
    benchmark.selected !== requirement.selected ||
    benchmark.workloadHash !== hashJson(requirement.workload) ||
    !Array.isArray(benchmark.measurements) ||
    benchmark.measurements.length !== requirement.candidates.length
  ) {
    return `Toolcraft kernel benchmark "${requirement.passId}" does not match its requirement.`;
  }
  const measurements = [...benchmark.measurements].sort((left, right) =>
    compareCodeUnits(left?.candidate ?? "", right?.candidate ?? ""),
  );
  const outputHashes = new Set();
  for (const [index, candidate] of requirement.candidates.entries()) {
    const measurement = measurements[index];
    if (
      !isRecord(measurement) ||
      measurement.candidate !== candidate ||
      typeof measurement.durationMs !== "number" ||
      !Number.isFinite(measurement.durationMs) ||
      measurement.durationMs <= 0 ||
      !Number.isSafeInteger(measurement.iterations) ||
      measurement.iterations <= 0 ||
      !isHash(measurement.implementationHash) ||
      !isHash(measurement.outputHash)
    ) {
      return `Toolcraft kernel benchmark "${requirement.passId}" measurement for "${candidate}" is malformed.`;
    }
    outputHashes.add(measurement.outputHash);
  }
  if (outputHashes.size !== 1) {
    return `Toolcraft kernel benchmark "${requirement.passId}" candidates did not produce equal full-quality output.`;
  }
  return undefined;
}

function getEmbeddedRequirementsError(requirements) {
  if (!Array.isArray(requirements)) {
    return "Toolcraft kernel benchmark receipt requirements are malformed.";
  }
  const passIds = [];
  for (const requirement of requirements) {
    if (
      !isRecord(requirement) ||
      typeof requirement.passId !== "string" ||
      requirement.passId.length === 0 ||
      typeof requirement.selected !== "string" ||
      !uniqueSortedStrings(requirement.candidates) ||
      !requirement.candidates.includes(requirement.selected)
    ) {
      return "Toolcraft kernel benchmark receipt requirements are malformed.";
    }
    let normalizedWorkload;
    try {
      normalizedWorkload = normalizeWorkload(requirement.workload);
    } catch {
      return "Toolcraft kernel benchmark receipt requirements are malformed.";
    }
    if (JSON.stringify(normalizedWorkload) !== JSON.stringify(requirement.workload)) {
      return "Toolcraft kernel benchmark receipt requirement workload is not canonical.";
    }
    passIds.push(requirement.passId);
  }
  if (
    new Set(passIds).size !== passIds.length ||
    passIds.some(
      (passId, index) => index > 0 && compareCodeUnits(passIds[index - 1], passId) >= 0,
    )
  ) {
    return "Toolcraft kernel benchmark receipt requirement pass ids must be unique and sorted.";
  }
  return undefined;
}

export function getToolcraftKernelBenchmarkReceiptError(receipt, expected = {}) {
  if (
    !isRecord(receipt) ||
    receipt.version !== TOOLCRAFT_KERNEL_BENCHMARK_RECEIPT_VERSION ||
    receipt.kind !== "kernel-benchmark" ||
    receipt.runner !== "protected-playwright" ||
    receipt.status !== "passed" ||
    typeof receipt.nonce !== "string" ||
    receipt.nonce.length === 0 ||
    !isHash(receipt.sourceHash) ||
    !isHash(receipt.requirementHash) ||
    typeof receipt.completedAt !== "string" ||
    !Number.isFinite(Date.parse(receipt.completedAt)) ||
    !Array.isArray(receipt.requirements) ||
    !Array.isArray(receipt.benchmarks)
  ) {
    return "Toolcraft kernel benchmark receipt is malformed.";
  }
  const embeddedRequirementsError = getEmbeddedRequirementsError(
    receipt.requirements,
  );
  if (embeddedRequirementsError) return embeddedRequirementsError;
  if (
    receipt.requirementHash !==
    getToolcraftKernelBenchmarkRequirementHash(receipt.requirements)
  ) {
    return "Toolcraft kernel benchmark receipt requirement hash is invalid.";
  }
  if (expected.nonce !== undefined && receipt.nonce !== expected.nonce) {
    return "Toolcraft kernel benchmark receipt nonce does not match the protected runner.";
  }
  if (expected.sourceHash !== undefined && receipt.sourceHash !== expected.sourceHash) {
    return "Toolcraft kernel benchmark receipt is stale for the current source.";
  }
  const requirements = expected.requirements ?? receipt.requirements;
  if (expected.requirements !== undefined) {
    const requirementHash = getToolcraftKernelBenchmarkRequirementHash(requirements);
    if (receipt.requirementHash !== requirementHash) {
      return "Toolcraft kernel benchmark receipt requirements do not match the current render plan.";
    }
  }
  if (receipt.benchmarks.length !== requirements.length) {
    return "Toolcraft kernel benchmark receipt does not cover every current requirement.";
  }
  const benchmarksByPassId = new Map(
    receipt.benchmarks.map((benchmark) => [benchmark?.passId, benchmark]),
  );
  if (benchmarksByPassId.size !== receipt.benchmarks.length) {
    return "Toolcraft kernel benchmark receipt contains duplicate pass ids.";
  }
  for (const requirement of requirements) {
    const error = getBenchmarkError(
      benchmarksByPassId.get(requirement.passId),
      requirement,
    );
    if (error) return error;
  }
  return undefined;
}

export async function readToolcraftKernelBenchmarkReceipt(filePath, expected = {}) {
  let receipt;
  try {
    receipt = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("Toolcraft kernel benchmark receipt is missing.");
    }
    throw new Error("Toolcraft kernel benchmark receipt is malformed JSON.");
  }
  const validationError = getToolcraftKernelBenchmarkReceiptError(receipt, expected);
  if (validationError) throw new Error(validationError);
  return receipt;
}

export async function writeToolcraftKernelBenchmarkReport(filePath, value) {
  const validationError = getToolcraftKernelBenchmarkReceiptError(value, {
    nonce: value.nonce,
    requirements: value.requirements,
    sourceHash: value.sourceHash,
  });
  if (validationError) throw new Error(validationError);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporaryPath, filePath);
  return value;
}
