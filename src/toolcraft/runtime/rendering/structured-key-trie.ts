export type StructuredKeyTrieNode<T> = {
  children: Map<unknown, StructuredKeyTrieNode<T>>;
  entry?: T;
  parent?: StructuredKeyTrieNode<T>;
  parentKey?: unknown;
};

export function createStructuredKeyTrie<T>(): StructuredKeyTrieNode<T> {
  return { children: new Map() };
}

export function getStructuredKeyTrieNode<T>(
  root: StructuredKeyTrieNode<T>,
  key: readonly unknown[],
  create: boolean,
): StructuredKeyTrieNode<T> | undefined {
  let node = root;

  for (const part of key) {
    let child = node.children.get(part);
    if (!child) {
      if (!create) {
        return undefined;
      }
      child = {
        children: new Map(),
        parent: node,
        parentKey: part,
      };
      node.children.set(part, child);
    }
    node = child;
  }

  return node;
}

export function deleteStructuredKeyTrieEntry<T>(
  root: StructuredKeyTrieNode<T>,
  node: StructuredKeyTrieNode<T>,
  entry: T,
): boolean {
  if (node.entry !== entry) {
    return false;
  }

  delete node.entry;
  let current = node;
  while (
    current !== root &&
    current.entry === undefined &&
    current.children.size === 0
  ) {
    const parent = current.parent;
    if (!parent) {
      break;
    }
    parent.children.delete(current.parentKey);
    delete current.parent;
    delete current.parentKey;
    current = parent;
  }

  return true;
}

export function clearStructuredKeyTrie<T>(
  root: StructuredKeyTrieNode<T>,
): void {
  function detach(node: StructuredKeyTrieNode<T>): void {
    for (const child of node.children.values()) {
      detach(child);
    }
    node.children.clear();
    delete node.entry;
    delete node.parent;
    delete node.parentKey;
  }

  detach(root);
}

export function countStructuredKeyTrieBranches<T>(
  root: StructuredKeyTrieNode<T>,
): number {
  let count = 0;
  for (const child of root.children.values()) {
    count += 1 + countStructuredKeyTrieBranches(child);
  }
  return count;
}
