function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export class ToolcraftReadonlyMap {
  #values;

  constructor(values) {
    this.#values = new Map(values);
    Object.freeze(this);
  }

  get size() { return this.#values.size; }
  entries() { return this.#values.entries(); }
  get(key) { return this.#values.get(key); }
  has(key) { return this.#values.has(key); }
  keys() { return this.#values.keys(); }
  values() { return this.#values.values(); }
  [Symbol.iterator]() { return this.#values[Symbol.iterator](); }
}

export function freezeToolcraftAdjacency(adjacency) {
  return new ToolcraftReadonlyMap(
    [...adjacency].map(([repoPath, dependencies]) => [
      repoPath,
      Object.freeze([...dependencies]),
    ]),
  );
}

export function reverseToolcraftAdjacency(forward) {
  const reverse = new Map(
    [...forward.keys()].map((repoPath) => [repoPath, []]),
  );
  for (const [importer, dependencies] of forward) {
    for (const dependency of dependencies) {
      reverse.get(dependency).push(importer);
    }
  }
  for (const importers of reverse.values()) {
    importers.sort(compareCodeUnits);
  }
  return reverse;
}
