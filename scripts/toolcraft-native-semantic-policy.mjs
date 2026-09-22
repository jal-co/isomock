function policy(tag, attributes = []) {
  return Object.freeze({
    attributes: Object.freeze(attributes),
    tag,
  });
}

export const toolcraftNativeSemanticHostPolicies = Object.freeze([
  policy("a", ["href"]),
  policy("area", ["href"]),
  policy("audio", ["controls"]),
  policy("button", ["type"]),
  policy("datalist"),
  policy("details", ["open"]),
  policy("dialog", ["open"]),
  policy("embed", ["src", "type"]),
  policy("fieldset", ["disabled"]),
  policy("form", ["action", "method"]),
  policy("iframe", ["src", "srcdoc"]),
  policy("input", ["type"]),
  policy("label", ["htmlfor"]),
  policy("legend"),
  policy("meter", ["high", "low", "max", "min", "optimum", "value"]),
  policy("object", ["data", "type"]),
  policy("optgroup", ["disabled", "label"]),
  policy("option", ["disabled", "label", "selected", "value"]),
  policy("output", ["for", "htmlfor"]),
  policy("progress", ["max", "value"]),
  policy("select", ["multiple"]),
  policy("summary"),
  policy("textarea", ["rows", "wrap"]),
  policy("video", ["controls"]),
]);

const policyByTag = new Map(
  toolcraftNativeSemanticHostPolicies.map((entry) => [entry.tag, entry]),
);
const universalSemanticAttributes = new Set([
  "contenteditable",
  "role",
  "tabindex",
]);
const rawInjectionTags = new Map([
  ["base", "document-global"],
  ["body", "document-global"],
  ["head", "document-global"],
  ["html", "document-global"],
  ["link", "stylesheet"],
  ["meta", "document-global"],
  ["script", "executable"],
  ["style", "stylesheet"],
]);
const actionableRoles = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "scrollbar",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);

export const toolcraftNativeSemanticHostTags = Object.freeze(
  toolcraftNativeSemanticHostPolicies.map(({ tag }) => tag),
);

export function getToolcraftNativeSemanticHostPolicy(tag) {
  return typeof tag === "string" ? policyByTag.get(tag.toLowerCase()) : undefined;
}

export function isToolcraftNativeSemanticHostTag(tag) {
  return getToolcraftNativeSemanticHostPolicy(tag) !== undefined;
}

export function getToolcraftNativeSemanticAttributeKind(tag, name) {
  if (typeof name !== "string") return undefined;
  const normalized = name.toLowerCase();
  if (normalized.startsWith("on") && normalized.length > 2) return "action";
  if (universalSemanticAttributes.has(normalized)) return "action";
  return getToolcraftNativeSemanticHostPolicy(tag)?.attributes.includes(normalized)
    ? "semantic"
    : undefined;
}

export function isToolcraftNativeActionAttributeName(name) {
  return getToolcraftNativeSemanticAttributeKind(undefined, name) === "action";
}

export function isToolcraftNativeActionableRole(value) {
  return typeof value === "string" && actionableRoles.has(value.toLowerCase());
}

export function getToolcraftRawMarkupInjectionKind(tag, attributeName) {
  if (typeof attributeName === "string" &&
    attributeName.toLowerCase() === "style") return "inline-style";
  return typeof tag === "string"
    ? rawInjectionTags.get(tag.toLowerCase())
    : undefined;
}
