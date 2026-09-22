import {
  isNonNullObject,
  isTrimmedNonEmptyString,
  type UnknownRecord,
} from "./performance-workload-envelope-shared";

type TraversalFrame = {
  dimensionId: string;
  inputs: readonly string[];
  nextInputIndex: number;
};

function getGraphInputs(dimension: UnknownRecord): string[] {
  if (!isNonNullObject(dimension.source) || dimension.source.kind !== "derived") {
    return [];
  }

  const inputs = dimension.source.inputs;
  if (!Array.isArray(inputs)) {
    return [];
  }

  return inputs.filter(isTrimmedNonEmptyString);
}

export function getDerivedDependencyCycleErrors(
  dimensions: readonly UnknownRecord[],
  dimensionIdCounts: ReadonlyMap<string, number>,
): string[] {
  const dimensionsById = new Map<string, UnknownRecord>();

  for (const dimension of dimensions) {
    if (
      isTrimmedNonEmptyString(dimension.id) &&
      dimensionIdCounts.get(dimension.id) === 1
    ) {
      dimensionsById.set(dimension.id, dimension);
    }
  }

  const states = new Map<string, "visiting" | "visited">();
  const reportedCycles = new Set<string>();
  const errors: string[] = [];

  for (const rootDimensionId of dimensionsById.keys()) {
    if (states.has(rootDimensionId)) {
      continue;
    }

    states.set(rootDimensionId, "visiting");
    const traversal: TraversalFrame[] = [
      {
        dimensionId: rootDimensionId,
        inputs: getGraphInputs(dimensionsById.get(rootDimensionId)!),
        nextInputIndex: 0,
      },
    ];

    while (traversal.length > 0) {
      const frame = traversal.at(-1)!;

      if (frame.nextInputIndex >= frame.inputs.length) {
        states.set(frame.dimensionId, "visited");
        traversal.pop();
        continue;
      }

      const input = frame.inputs[frame.nextInputIndex]!;
      frame.nextInputIndex += 1;

      if (input === frame.dimensionId || !dimensionsById.has(input)) {
        continue;
      }

      const inputState = states.get(input);
      if (!inputState) {
        states.set(input, "visiting");
        traversal.push({
          dimensionId: input,
          inputs: getGraphInputs(dimensionsById.get(input)!),
          nextInputIndex: 0,
        });
        continue;
      }

      if (inputState === "visiting") {
        const cycleStart = traversal.findIndex(
          ({ dimensionId }) => dimensionId === input,
        );
        if (cycleStart < 0) {
          continue;
        }

        const cycle = [
          ...traversal.slice(cycleStart).map(({ dimensionId }) => dimensionId),
          input,
        ];
        const message = `Derived workload dependency cycle detected: ${cycle.join(" -> ")}.`;

        if (!reportedCycles.has(message)) {
          reportedCycles.add(message);
          errors.push(message);
        }
      }
    }
  }

  return errors;
}
