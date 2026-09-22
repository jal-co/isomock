export const toolcraftDiscreteCombinationBudget = 4096;
export const toolcraftDiscreteDimensionBudget = 256;

export type ToolcraftDiscreteCombinationCardinality =
  | {
      cardinality: number;
      status: "within-budget";
    }
  | {
      budget: number;
      cardinality: number;
      status: "over-budget";
    }
  | {
      status: "overflow";
    }
  | {
      budget: number;
      dimensions: number;
      status: "over-dimension-budget";
    };

export function getToolcraftDiscreteCombinationCardinality(
  domainSizes: readonly number[],
): ToolcraftDiscreteCombinationCardinality {
  if (domainSizes.length > toolcraftDiscreteDimensionBudget) {
    return {
      budget: toolcraftDiscreteDimensionBudget,
      dimensions: domainSizes.length,
      status: "over-dimension-budget",
    };
  }
  let cardinality = BigInt(1);
  for (const domainSize of domainSizes) {
    if (!Number.isSafeInteger(domainSize) || domainSize < 0) {
      return { status: "overflow" };
    }
    cardinality *= BigInt(domainSize);
    if (cardinality > BigInt(Number.MAX_SAFE_INTEGER)) {
      return { status: "overflow" };
    }
  }
  const numericCardinality = Number(cardinality);
  return numericCardinality <= toolcraftDiscreteCombinationBudget
    ? { cardinality: numericCardinality, status: "within-budget" }
    : {
        budget: toolcraftDiscreteCombinationBudget,
        cardinality: numericCardinality,
        status: "over-budget",
      };
}

export function getToolcraftDiscreteCombinationPlanningError(
  pathId: string,
  domainSizes: readonly number[],
): string | undefined {
  const result = getToolcraftDiscreteCombinationCardinality(domainSizes);
  if (result.status === "within-budget") return undefined;
  if (result.status === "over-dimension-budget") {
    return `Performance path "${pathId}" has ${result.dimensions} discrete dimensions, exceeding the deterministic path-level dimension budget ${result.budget}. Reduce the workload vector or provide one exact inverse checkpoint for the custom/benchmark path.`;
  }
  if (result.status === "overflow") {
    return `Performance path "${pathId}" discrete domain cardinality exceeds safe integer capacity and cannot be planned.`;
  }
  return `Performance path "${pathId}" requires ${result.cardinality} discrete combinations, exceeding the deterministic path-level budget ${result.budget}.`;
}

export function searchToolcraftDiscreteCombinations<T>(
  domains: readonly (readonly T[])[],
  visitor: (combination: readonly T[]) => boolean,
): { match?: readonly T[]; visited: number } {
  if (domains.some((domain) => domain.length === 0)) return { visited: 0 };
  if (domains.length === 0) {
    const candidate: readonly T[] = [];
    return visitor(candidate)
      ? { match: candidate, visited: 1 }
      : { visited: 1 };
  }

  const indices = Array.from({ length: domains.length }, () => 0);
  let visited = 0;
  while (true) {
    const candidate = domains.map((domain, index) => domain[indices[index]!]!);
    visited += 1;
    if (visitor(candidate)) return { match: candidate, visited };

    let cursor = indices.length - 1;
    while (cursor >= 0) {
      indices[cursor] += 1;
      if (indices[cursor]! < domains[cursor]!.length) break;
      indices[cursor] = 0;
      cursor -= 1;
    }
    if (cursor < 0) return { visited };
  }
}
