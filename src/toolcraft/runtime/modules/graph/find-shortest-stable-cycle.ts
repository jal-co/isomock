function comparePaths<TNode extends string>(
  left: readonly TNode[],
  right: readonly TNode[],
): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const comparison = left[index]!.localeCompare(right[index]!);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return left.length - right.length;
}

function normalizeClosedCycle<TNode extends string>(
  closedCycle: readonly TNode[],
): readonly TNode[] {
  const cycle = closedCycle.slice(0, -1);
  let normalized = [...cycle, cycle[0]!];

  for (let offset = 1; offset < cycle.length; offset += 1) {
    const rotation = [
      ...cycle.slice(offset),
      ...cycle.slice(0, offset),
      cycle[offset]!,
    ];
    if (comparePaths(rotation, normalized) < 0) {
      normalized = rotation;
    }
  }

  return normalized;
}

export function findShortestStableCycle<TNode extends string>(
  adjacency: ReadonlyMap<TNode, Iterable<TNode>>,
): readonly TNode[] | undefined {
  const nodeSet = new Set<TNode>();
  const sortedAdjacency = new Map<TNode, readonly TNode[]>();
  for (const [node, neighbors] of adjacency) {
    const sortedNeighbors = [...neighbors].sort();
    nodeSet.add(node);
    sortedAdjacency.set(node, sortedNeighbors);
    for (const neighbor of sortedNeighbors) {
      nodeSet.add(neighbor);
    }
  }

  const nodes = [...nodeSet].sort();
  let shortestCycle: readonly TNode[] | undefined;

  for (const start of nodes) {
    const visited = new Set<TNode>([start]);
    const queue: {
      node: TNode;
      path: readonly TNode[];
    }[] = [{ node: start, path: [start] }];

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      const neighbors = sortedAdjacency.get(current.node) ?? [];

      for (const neighbor of neighbors) {
        if (neighbor === start) {
          const candidate = normalizeClosedCycle([...current.path, start]);
          if (
            shortestCycle === undefined ||
            candidate.length < shortestCycle.length ||
            (candidate.length === shortestCycle.length &&
              comparePaths(candidate, shortestCycle) < 0)
          ) {
            shortestCycle = candidate;
          }
          continue;
        }

        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, path: [...current.path, neighbor] });
        }
      }
    }
  }

  return shortestCycle === undefined
    ? undefined
    : Object.freeze([...shortestCycle]);
}
