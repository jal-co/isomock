import { isToolcraftFrameworkCssToken,
  toolcraftPublicUiSpecifiers } from "./toolcraft-public-ui-ownership.mjs";

export const toolcraftPublicComponentStylePolicy = Object.freeze({
  publicSpecifiers: toolcraftPublicUiSpecifiers,
  utilityDomains: Object.freeze([
    Object.freeze({
      domain: "border",
      namespaces: Object.freeze(["border", "outline", "ring"]),
    }),
    Object.freeze({
      domain: "radius",
      namespaces: Object.freeze(["rounded"]),
    }),
    Object.freeze({
      domain: "background",
      namespaces: Object.freeze(["bg", "from", "to", "via"]),
    }),
    Object.freeze({
      domain: "shadow",
      namespaces: Object.freeze(["drop-shadow", "shadow"]),
    }),
    Object.freeze({
      domain: "opacity",
      namespaces: Object.freeze(["opacity"]),
    }),
    Object.freeze({
      domain: "filter",
      namespaces: Object.freeze(["filter", "blur", "brightness", "contrast", "grayscale", "hue-rotate", "invert", "saturate", "sepia", "mix-blend"]),
    }),
    Object.freeze({
      domain: "color",
      namespaces: Object.freeze(["accent", "caret", "fill", "stroke"]),
    }),
  ]),
  baseStates: Object.freeze([
    "active",
    "busy",
    "checked",
    "disabled",
    "enabled",
    "expanded",
    "focus",
    "focus-visible",
    "focus-within",
    "hover",
    "invalid",
    "open",
    "pressed",
    "selected",
    "visited",
  ]),
  stateCombinators: Object.freeze([
    "group",
    "peer",
  ]),
  typographyTextUtilities: Object.freeze([
    "text-2xl",
    "text-3xl",
    "text-4xl",
    "text-5xl",
    "text-6xl",
    "text-7xl",
    "text-8xl",
    "text-9xl",
    "text-base",
    "text-balance",
    "text-center",
    "text-ellipsis",
    "text-end",
    "text-justify",
    "text-left",
    "text-lg",
    "text-nowrap",
    "text-pretty",
    "text-right",
    "text-sm",
    "text-start",
    "text-wrap",
    "text-xl",
    "text-xs",
  ]),
});

const inlineStyleDomains = Object.freeze([
  Object.freeze({ domain: "radius", names: Object.freeze([
    "borderbottomleftradius", "borderbottomrightradius", "borderradius",
    "borderstartendradius", "borderstartstartradius", "borderendendradius",
    "borderendstartradius", "bordertopleftradius", "bordertoprightradius",
  ]) }),
  Object.freeze({ domain: "border", prefixes: Object.freeze([
    "border", "outline", "ring",
  ]) }),
  Object.freeze({ domain: "background", prefixes: Object.freeze([
    "background",
  ]) }),
  Object.freeze({ domain: "color", names: Object.freeze([
    "accentcolor", "caretcolor", "color", "fill", "stroke", "strokecolor",
  ]) }),
  Object.freeze({ domain: "shadow", names: Object.freeze([
    "boxshadow", "textshadow",
  ]) }),
  Object.freeze({ domain: "opacity", names: Object.freeze(["opacity"]) }),
  Object.freeze({ domain: "filter", names: Object.freeze(["filter", "backdropfilter", "mixblendmode", "mask", "maskimage", "webkitmaskimage"]) }),
  Object.freeze({ domain: "text-decoration", prefixes: Object.freeze([
    "textdecoration",
  ]) }),
]);

export const toolcraftOwnedPublicChromeDomains = Object.freeze([
  "background",
  "border",
  "color",
  "opacity",
  "radius",
  "shadow",
  "text-decoration",
  "filter",
  "framework-token",
]);

const ownedStateAttributes = Object.freeze(new Map([
  ["aria-busy", Object.freeze(["true"])],
  ["aria-checked", Object.freeze(["true", "mixed"])],
  ["aria-disabled", Object.freeze(["true"])],
  ["aria-expanded", Object.freeze(["true"])],
  ["aria-invalid", Object.freeze(["true", "grammar", "spelling"])],
  ["aria-pressed", Object.freeze(["true", "mixed"])],
  ["aria-selected", Object.freeze(["true"])],
  ["data-disabled", Object.freeze(["", "true"])],
  ["data-invalid", Object.freeze(["", "true"])],
  ["data-state", toolcraftPublicComponentStylePolicy.baseStates],
]));

function tokenParts(token) {
  const parts = [];
  let current = "";
  let bracketDepth = 0;
  for (const character of token) {
    if (character === "[") bracketDepth += 1;
    if (character === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    if (character === ":" && bracketDepth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts;
}

function normalizedUtility(utility) {
  const withoutPrefix = utility.startsWith("!") ? utility.slice(1) : utility;
  return withoutPrefix.endsWith("!") ? withoutPrefix.slice(0, -1) : withoutPrefix;
}

function ownsNamespace(utility, namespace) {
  const normalized = normalizedUtility(utility);
  return normalized === namespace || normalized.startsWith(`${namespace}-`);
}

function arbitraryUtilityDomain(utility) {
  const normalized = normalizedUtility(utility);
  if (!normalized.startsWith("[") || !normalized.endsWith("]")) {
    return undefined;
  }
  const property = normalized.slice(1, -1).split(":", 1)[0].toLowerCase();
  if (isToolcraftFrameworkCssToken(property)) return "framework-token";
  if (getToolcraftOwnedInlineStyleDomain(property) === "filter") return "filter";
  if (property === "border-radius" ||
    property.startsWith("border-") && property.endsWith("-radius")) {
    return "radius";
  }
  if (["background", "background-color", "background-image"].includes(property)) {
    return "background";
  }
  if (["color", "fill", "stroke"].includes(property)) return "color";
  if (property === "opacity") return "opacity";
  if (property === "box-shadow" || property === "text-shadow") return "shadow";
  if (property === "text-decoration" ||
    property.startsWith("text-decoration-") ||
    property === "text-underline-offset") return "text-decoration";
  return ["border", "outline"].some((namespace) =>
    property === namespace || property.startsWith(`${namespace}-`)
  ) ? "border" : undefined;
}

function arbitraryVariantHasState(variant, baseStates) {
  if (!variant.startsWith("[") || !variant.endsWith("]")) return false;
  const tokens = variant.slice(1, -1).toLowerCase()
    .split(/[^a-z0-9-]+/u).filter(Boolean);
  return tokens.some((token) => baseStates.has(token) ||
    ownedStateAttributes.has(token) ||
    token.startsWith("data-") && baseStates.has(token.slice(5)));
}

function attributeVariantHasState(value, baseStates) {
  if (ownedStateAttributes.has(value)) return true;
  if (value.startsWith("data-") && baseStates.has(value.slice(5))) return true;
  const match = /^(aria|data)-\[([a-z0-9-]+)(?:=([^\]]+))?\]$/u.exec(value);
  if (!match) return false;
  const [, prefix, name, attributeValue] = match;
  if (prefix === "data" && baseStates.has(name)) return true;
  return isToolcraftOwnedComponentStateAttribute(
    `${prefix}-${name}`,
    attributeValue,
  );
}

function variantHasState(variant) {
  const baseStates = new Set(toolcraftPublicComponentStylePolicy.baseStates);
  let value = variant.toLowerCase().replace(/^:/u, "");
  const slash = value.indexOf("/");
  if (slash >= 0) value = value.slice(0, slash);
  while (value.startsWith("not-")) value = value.slice(4);
  for (const combinator of toolcraftPublicComponentStylePolicy.stateCombinators) {
    if (value.startsWith(`${combinator}-`)) {
      return variantHasState(value.slice(combinator.length + 1));
    }
  }
  if (attributeVariantHasState(value, baseStates)) return true;
  return baseStates.has(value) || arbitraryVariantHasState(value, baseStates);
}

function textUtilityIsTypography(utility) {
  const normalized = normalizedUtility(utility);
  return toolcraftPublicComponentStylePolicy.typographyTextUtilities.includes(
    normalized,
  ) || /^text-\[(?:length:)?(?:-?\d|calc\(|clamp\(|min\(|max\()/u.test(
    normalized,
  );
}

export function getToolcraftOwnedComponentChromeDomain(token) {
  const parts = tokenParts(token);
  const utility = parts.pop() ?? "";
  const state = parts.some(variantHasState);
  if (state) return "interaction-state";
  const arbitrary = arbitraryUtilityDomain(utility);
  if (arbitrary) return arbitrary;
  if (ownsNamespace(utility, "text") && !textUtilityIsTypography(utility)) {
    return "color";
  }
  const normalized = normalizedUtility(utility);
  if (["line-through", "no-underline", "overline", "underline"].includes(
    normalized,
  ) || ownsNamespace(normalized, "decoration") ||
    ownsNamespace(normalized, "underline-offset")) return "text-decoration";
  return toolcraftPublicComponentStylePolicy.utilityDomains.find(({ namespaces }) =>
    namespaces.some((namespace) => ownsNamespace(utility, namespace))
  )?.domain;
}

export function getToolcraftOwnedComponentChromeDomains(token) {
  const parts = tokenParts(token);
  const utility = normalizedUtility(parts.at(-1) ?? "");
  if (/^\[all:/u.test(utility)) {
    return toolcraftOwnedPublicChromeDomains;
  }
  const domain = getToolcraftOwnedComponentChromeDomain(token);
  return domain ? Object.freeze([domain]) : Object.freeze([]);
}

export function getToolcraftOwnedInlineStyleDomain(propertyName) {
  if (typeof propertyName === "string" && isToolcraftFrameworkCssToken(propertyName)) return "framework-token";
  const normalized = typeof propertyName === "string"
    ? propertyName.toLowerCase().replaceAll("-", "").replace(/^(webkit|moz|ms)/u, "")
    : "";
  for (const entry of inlineStyleDomains) {
    if (entry.names?.includes(normalized) || entry.prefixes?.some((prefix) =>
      normalized === prefix || normalized.startsWith(prefix)
    )) return entry.domain;
  }
  return undefined;
}

export function getToolcraftOwnedCssDeclarationDomains(propertyName) {
  const normalized = typeof propertyName === "string"
    ? propertyName.toLowerCase().trim() : "";
  if (normalized === "all") return toolcraftOwnedPublicChromeDomains;
  const domain = getToolcraftOwnedInlineStyleDomain(normalized);
  return domain ? Object.freeze([domain]) : Object.freeze([]);
}

export function isToolcraftOwnedComponentState(value) {
  return typeof value === "string" && variantHasState(
    value.toLowerCase().replace(/^:/u, ""),
  );
}

export function isToolcraftOwnedComponentStateAttribute(name, value) {
  if (typeof name !== "string") return false;
  const accepted = ownedStateAttributes.get(name.toLowerCase());
  if (!accepted) return false;
  if (value === undefined) return true;
  return accepted.includes(String(value).toLowerCase());
}

export function getToolcraftAncestorUtilityDomains(token) {
  const parts = tokenParts(token);
  const domains = getToolcraftOwnedComponentChromeDomains(token);
  const targetsDescendants = parts.slice(0, -1).some((part) =>
    part === "*" || part === "**" || (part.startsWith("[") && /[_>+~]/u.test(part)));
  return targetsDescendants ? domains : domains.filter((domain) =>
    ["opacity", "filter", "framework-token", "color"].includes(domain));
}

export function getToolcraftAncestorStyleDomains(property) {
  return getToolcraftOwnedCssDeclarationDomains(property).filter((domain) =>
    ["opacity", "filter", "framework-token", "color"].includes(domain));
}
