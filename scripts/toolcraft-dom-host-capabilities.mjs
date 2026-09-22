function frozenNames(names) {
  return Object.freeze([...names]);
}

export const toolcraftDocumentHostFactoryNames = frozenNames([
  "createElement",
  "createElementNS",
  "importNode",
]);

export const toolcraftNodeHostFactoryNames = frozenNames([
  "cloneNode",
]);

export const toolcraftDomHostFactoryNames = frozenNames([
  ...toolcraftDocumentHostFactoryNames,
  ...toolcraftNodeHostFactoryNames,
]);

export const toolcraftDomMarkupCapabilityNames = frozenNames([
  "createcontextualfragment",
  "dangerouslysetinnerhtml",
  "innerhtml",
  "insertadjacenthtml",
  "outerhtml",
  "parsefromstring",
  "parsehtmlunsafe",
  "sethtmlunsafe",
  "srcdoc",
  "write",
  "writeln",
]);

export const toolcraftDomSemanticCapabilityNames = frozenNames([
  "contenteditable",
  "draggable",
  "role",
  "tabindex",
]);

export const toolcraftDomMutationCapabilityNames = frozenNames([
  "__definegetter__",
  "__definesetter__",
  "addeventlistener",
  "getnameditem",
  "getnameditemns",
  "removeeventlistener",
  "setattribute",
  "setattributenode",
  "setattributenodens",
  "setattributens",
  "setnameditem",
  "setnameditemns",
  "toggleattribute",
]);

export const toolcraftDomDangerousCapabilityNames = frozenNames([
  ...toolcraftDomHostFactoryNames.map((name) => name.toLowerCase()),
  ...toolcraftDomMarkupCapabilityNames,
  ...toolcraftDomSemanticCapabilityNames,
  ...toolcraftDomMutationCapabilityNames,
]);

export function isToolcraftDocumentHostFactoryName(name) {
  return toolcraftDocumentHostFactoryNames.includes(name);
}

export function isToolcraftNodeHostFactoryName(name) {
  return toolcraftNodeHostFactoryNames.includes(name);
}

export function isToolcraftDomHostFactoryName(name) {
  return toolcraftDomHostFactoryNames.includes(name);
}

export function isToolcraftDomMarkupCapabilityName(name) {
  return typeof name === "string" &&
    toolcraftDomMarkupCapabilityNames.includes(name.toLowerCase());
}

export function isToolcraftDomSemanticCapabilityName(name) {
  if (typeof name !== "string") return false;
  const normalized = name.toLowerCase();
  return normalized.startsWith("on") ||
    toolcraftDomSemanticCapabilityNames.includes(normalized);
}

export function isToolcraftDomMutationCapabilityName(name) {
  return typeof name === "string" &&
    toolcraftDomMutationCapabilityNames.includes(name.toLowerCase());
}

export function isToolcraftDangerousDomCapabilityName(name) {
  if (typeof name !== "string") return false;
  const normalized = name.toLowerCase();
  return normalized.startsWith("on") ||
    toolcraftDomDangerousCapabilityNames.includes(normalized);
}
