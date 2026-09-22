import path from "node:path";

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toPosixPath(value) {
  return value.split(path.sep).join("/").replace(/^\.\//u, "");
}

export function getToolcraftReachablePaths(graph, entryPaths) {
  const queue = entryPaths
    .map(toPosixPath)
    .filter((repoPath) => graph.forward.has(repoPath));
  const reachable = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const dependency of graph.forward.get(queue[cursor]) ?? []) {
      if (reachable.has(dependency)) continue;
      reachable.add(dependency);
      queue.push(dependency);
    }
  }
  return Object.freeze([...reachable].sort(compareCodeUnits));
}

function canonicalCycle(cycle) {
  const nodes = cycle.slice(0, -1);
  const rotations = nodes.map((_, index) => {
    const rotated = [...nodes.slice(index), ...nodes.slice(0, index)];
    return [...rotated, rotated[0]];
  });
  return rotations.sort((left, right) =>
    compareCodeUnits(left.join("\0"), right.join("\0")),
  )[0];
}

export function findToolcraftCycles(graph, includedPaths) {
  const included = new Set(includedPaths);
  const state = new Map();
  const stack = [];
  const cycleKeys = new Set();
  const cycles = [];
  function visit(repoPath) {
    state.set(repoPath, "visiting");
    stack.push(repoPath);
    for (const dependency of graph.forward.get(repoPath) ?? []) {
      if (!included.has(dependency)) continue;
      if (state.get(dependency) === "visiting") {
        const cycle = canonicalCycle([
          ...stack.slice(stack.indexOf(dependency)),
          dependency,
        ]);
        const key = cycle.join("\0");
        if (!cycleKeys.has(key)) {
          cycleKeys.add(key);
          cycles.push(cycle);
        }
      } else if (!state.has(dependency)) {
        visit(dependency);
      }
    }
    stack.pop();
    state.set(repoPath, "visited");
  }
  for (const repoPath of [...included].sort(compareCodeUnits)) {
    if (!state.has(repoPath)) visit(repoPath);
  }
  return Object.freeze(
    cycles.sort((left, right) =>
      compareCodeUnits(left.join("\0"), right.join("\0")),
    ),
  );
}
