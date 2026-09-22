import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

import { scanToolcraftCssUrlTokens } from "./toolcraft-css-url-scanner.mjs";
import { toolcraftCssPseudoName as pseudoName } from
  "./toolcraft-css-pseudo-name.mjs";
import {
  getToolcraftOwnedCssDeclarationDomains,
} from "./toolcraft-public-component-style-policy.mjs";
import {
  collectToolcraftCssModuleClassFacts,
  toolcraftCssSelectorUsesOwnedState,
} from "./toolcraft-css-module-facts.mjs";
import { toolcraftCssSelectorTargetsPublicChrome } from "./toolcraft-css-selector-subject.mjs";
import { isToolcraftFrameworkCssToken } from "./toolcraft-public-ui-ownership.mjs";

const EXTERNAL_CSS_URL_PATTERN =
  /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/|#)/u;

function compoundNodeHasLocalClass(node) {
  if (node.type === "class") return true;
  if (node.type !== "pseudo") return false;
  if ([":is", ":where"].includes(pseudoName(node))) {
    return Boolean(
      node.nodes?.length > 0 &&
        node.nodes.every(
          (branch) =>
            branch.type === "selector" &&
            selectorFirstCompoundHasLocalClass(branch),
        ),
    );
  }
  if (pseudoName(node) !== ":local") return false;
  let hasLocalClass = false;
  node.walkClasses(() => {
    hasLocalClass = true;
  });
  return hasLocalClass;
}

function selectorFirstCompoundHasLocalClass(selector) {
  for (const node of selector.nodes) {
    if (node.type === "combinator") break;
    if (compoundNodeHasLocalClass(node)) return true;
  }
  return false;
}

function inspectSiblingEscapes(selector, reasons, displaySelector = selector) {
  let currentCompoundHasLocalClass = false;
  let pendingSiblingCombinator;
  for (const node of selector.nodes) {
    if (node.type === "combinator") {
      if (pendingSiblingCombinator && !currentCompoundHasLocalClass) {
        reasons.push(
          `selector "${displaySelector}" escapes through sibling combinator ${pendingSiblingCombinator}`,
        );
      }
      const combinator = node.value.trim();
      pendingSiblingCombinator =
        combinator === "+" || combinator === "~" ? combinator : undefined;
      currentCompoundHasLocalClass = false;
      continue;
    }
    if (compoundNodeHasLocalClass(node)) currentCompoundHasLocalClass = true;
    if (node.type === "pseudo") {
      for (const branch of node.nodes ?? []) {
        if (branch.type === "selector") {
          inspectSiblingEscapes(branch, reasons, displaySelector);
        }
      }
    }
  }
  if (pendingSiblingCombinator && !currentCompoundHasLocalClass) {
    reasons.push(
      `selector "${displaySelector}" escapes through sibling combinator ${pendingSiblingCombinator}`,
    );
  }
}

function inspectSelector(selector, reasons) {
  inspectSiblingEscapes(selector, reasons);
  selector.walk((node) => {
    if (pseudoName(node) === ":global") {
      reasons.push(`selector "${selector}" uses :global`);
    }
    if (
      (node.type === "tag" && ["body", "html"].includes(node.value.toLowerCase())) ||
      (node.type === "id" && node.value === "root") ||
      pseudoName(node) === ":root"
    ) {
      reasons.push(`selector "${selector}" targets a document root`);
    }
    if (
      node.type === "attribute" &&
      ((node.attribute === "data-slot" &&
        /^toolcraft-/u.test(node.value ?? "")) ||
        (node.attribute.startsWith("data-toolcraft-") &&
          ![
            "data-toolcraft-product-output",
            "data-toolcraft-product-text",
          ].includes(node.attribute)))
    ) {
      reasons.push(`selector "${selector}" targets a Toolcraft host attribute`);
    }
  });
  if (!selectorFirstCompoundHasLocalClass(selector)) {
    reasons.push(`selector "${selector}" is not anchored to a local class`);
  }
}

function selectorTargetsPublicChrome(selector) {
  const scopeReasons = [];
  inspectSelector(selector, scopeReasons);
  if (scopeReasons.length > 0) return false;
  return toolcraftCssSelectorTargetsPublicChrome(selector);
}

function selectorUsesOwnedState(selector) {
  return toolcraftCssSelectorUsesOwnedState(selector);
}

function publicChromeViolation(rule, selectors, repoPath) {
  const ownedSelectors = [];
  selectors.each((selector) => {
    if (selectorTargetsPublicChrome(selector)) ownedSelectors.push(selector);
  });
  const reservedTokens = (rule.nodes ?? []).filter((node) =>
    node.type === "decl" && isToolcraftFrameworkCssToken(node.prop));
  if (ownedSelectors.length === 0 && reservedTokens.length === 0) return undefined;
  const domains = new Set();
  if (reservedTokens.length > 0) domains.add("framework-token");
  if (ownedSelectors.some(selectorUsesOwnedState)) {
    domains.add("interaction-state");
  }
  for (const node of rule.nodes ?? []) {
    if (node.type !== "decl") continue;
    for (const domain of ownedSelectors.length > 0 ? getToolcraftOwnedCssDeclarationDomains(node.prop) : []) {
      domains.add(domain);
    }
  }
  return domains.size === 0 ? undefined : Object.freeze({
    column: rule.source?.start?.column ?? 1,
    kind: "public-component-chrome",
    line: rule.source?.start?.line ?? 1,
    message:
      `Product CSS Modules cannot replace public UI chrome or define framework theme tokens (found: ${[...domains].join(", ")}). Use component-owned variants and limit public subject rules to layout, spacing, sizing, or typography.`,
    repoPath,
  });
}

function getSourceLocation(source, offset) {
  const prefix = source.slice(0, offset);
  return {
    column: offset - prefix.lastIndexOf("\n"),
    line: (prefix.match(/\n/gu)?.length ?? 0) + 1,
  };
}

function collectValueUrlFacts({ facts, rawSource, value, valueOffset }) {
  for (const token of scanToolcraftCssUrlTokens(value)) {
    facts.push(Object.freeze({
      ...getSourceLocation(rawSource, valueOffset + token.start),
      local:
        token.value.length > 0 &&
        !EXTERNAL_CSS_URL_PATTERN.test(token.value),
      quoted: token.quoted,
      rawValue: token.rawValue,
      value: token.value,
    }));
  }
}

function collectUrlFacts(root, rawSource) {
  const facts = [];
  root.walk((node) => {
    if (node.type === "decl") {
      collectValueUrlFacts({
        facts,
        rawSource,
        value: node.value,
        valueOffset:
          node.source.start.offset + node.prop.length + node.raws.between.length,
      });
    } else if (node.type === "atrule" && node.params) {
      collectValueUrlFacts({
        facts,
        rawSource,
        value: node.params,
        valueOffset:
          node.source.start.offset +
          node.name.length +
          (node.raws.afterName?.length ?? 0) +
          1,
      });
    }
  });
  return Object.freeze(facts);
}

function createCssEvidence(
  reasons,
  repoPath,
  urlFacts,
  chromeViolations,
  classFacts,
) {
  const uniqueReasons = Object.freeze([...new Set(reasons)]);
  const scopeViolations = uniqueReasons.length === 0
    ? []
    : [Object.freeze({
        column: 1,
        kind: "product-global-css",
        line: 1,
        message:
          `Product styles must use selector-local *.module.css rules and must not escape into the signed Toolcraft host. ${uniqueReasons.join("; ")}.`,
        repoPath,
      })];
  const violations = Object.freeze([...scopeViolations, ...chromeViolations]);
  return Object.freeze({
    classFacts,
    reasons: uniqueReasons,
    urlFacts,
    violations,
  });
}

export function createToolcraftCssSourceRecord({ rawSource, repoPath }) {
  const reasons = [];
  const chromeViolations = [];
  let classFacts = Object.freeze([]);
  let urlFacts = Object.freeze([]);
  if (!/\.module\.css$/iu.test(repoPath)) {
    reasons.push("the file is not a CSS Module");
  }
  try {
    const root = postcss.parse(rawSource, { from: repoPath });
    urlFacts = collectUrlFacts(root, rawSource);
    classFacts = collectToolcraftCssModuleClassFacts({ root, selectorParser });
    root.walkAtRules("import", () => {
      reasons.push("CSS @import can pull unscoped styles into the product bundle");
    });
    root.walkAtRules("property", (rule) => {
      if (isToolcraftFrameworkCssToken(rule.params.trim())) {
        reasons.push("CSS @property cannot redefine a framework theme token");
      }
    });
    root.walkRules((rule) => {
      selectorParser((selectors) => {
        selectors.each((selector) => inspectSelector(selector, reasons));
        const violation = publicChromeViolation(rule, selectors, repoPath);
        if (violation) chromeViolations.push(violation);
      }).processSync(rule.selector);
    });
  } catch (error) {
    reasons.push(
      `CSS could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return Object.freeze({
    cssEvidence: createCssEvidence(
      reasons,
      repoPath,
      urlFacts,
      chromeViolations,
      classFacts,
    ),
    imports: Object.freeze([]),
    rawSource,
  });
}
