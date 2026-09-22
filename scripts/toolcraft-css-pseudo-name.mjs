export function toolcraftCssPseudoName(node) {
  return node?.type === "pseudo" ? node.value.toLowerCase() : undefined;
}
