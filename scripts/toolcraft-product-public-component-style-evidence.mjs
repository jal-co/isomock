import {
  getToolcraftOwnedComponentChromeDomains,
  getToolcraftOwnedCssDeclarationDomains,
  getToolcraftAncestorUtilityDomains,
  getToolcraftAncestorStyleDomains,
} from "./toolcraft-public-component-style-policy.mjs";
import { getToolcraftPublicUiOwner } from "./toolcraft-public-ui-ownership.mjs";
import { createToolcraftProductClassValueEvidence } from "./toolcraft-product-class-value-evidence.mjs";
import { createToolcraftProductStyleValueEvidence } from "./toolcraft-product-style-value-evidence.mjs";
import { createToolcraftProductRenderOwnership } from "./toolcraft-product-render-ownership.mjs";

const STYLE_PROPERTY = Object.freeze({ canonical: "style", typed: "style" });

export function createToolcraftProductPublicComponentStyleEvidence({
  checker,
  flowValues,
  hostConstruction,
  repoPath,
  resolveCssModuleClass,
  resolveStaticString,
  ts,
}) {
  const { finalProperty, styleProperties } = createToolcraftProductStyleValueEvidence({
    flowValues,
    resolveStaticString,
    ts,
  });
  const { hasPublicDescendant, renderTargets } = createToolcraftProductRenderOwnership({
    checker,
    hostConstruction,
    ts,
  });

  const classEvidence = createToolcraftProductClassValueEvidence({
    checker,
    flowValues,
    resolveStaticString,
    ts,
  });

  return function inspectPublicComponentStyle(node, suppliedOwner, visited = new Set()) {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) {
      return undefined;
    }
    const origins = hostConstruction.originOf(node.tagName);
    const owner = suppliedOwner ?? origins.map(getToolcraftPublicUiOwner).find(Boolean);
    const ancestor = !owner && hasPublicDescendant(node);
    const geometry = !owner && !ancestor;
    const utilityDomains = owner
      ? getToolcraftOwnedComponentChromeDomains
      : ancestor
        ? getToolcraftAncestorUtilityDomains
        : (token) =>
            getToolcraftOwnedComponentChromeDomains(token).filter(
              (domain) => domain === "framework-token",
            );
    const styleDomains = owner
      ? getToolcraftOwnedCssDeclarationDomains
      : ancestor
        ? getToolcraftAncestorStyleDomains
        : (name) =>
            getToolcraftOwnedCssDeclarationDomains(name).filter(
              (domain) => domain === "framework-token",
            );
    const classProperties = new Set(["className"]);
    if (owner) {
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxAttribute(attribute)) {
          const name = attribute.name.getText();
          if (name.endsWith("ClassName")) classProperties.add(name);
        } else if (ts.isJsxSpreadAttribute(attribute)) {
          const spread = flowValues.objectAt(attribute.expression, attribute);
          for (const variant of spread.variants ?? []) {
            for (const name of variant.properties.keys()) {
              if (name.endsWith("ClassName")) classProperties.add(name);
            }
          }
        }
      }
    }
    const style = finalProperty(node.attributes, STYLE_PROPERTY);
    const domains = [];
    if (owner) {
      const render = finalProperty(node.attributes, { canonical: "render", typed: "render" });
      if (render.kind === "unknown") domains.push("unresolved-render");
      if (render.kind === "value") {
        const targets = renderTargets(render.value);
        // CSS import facts belong to this source file. Opaque/cross-file render
        // replacements must not accidentally use the caller's CSS facts.
        if (
          !targets ||
          visited.has(node) ||
          targets.some((target) => target.getSourceFile() !== node.getSourceFile())
        )
          domains.push("unresolved-render");
        else
          for (const target of targets) {
            const nested = inspectPublicComponentStyle(
              target,
              { ...owner, tag: "*" },
              new Set(visited).add(node),
            );
            if (nested) domains.push(...nested.domains);
          }
      }
    }
    for (const classProperty of classProperties) {
      const className = finalProperty(node.attributes, {
        canonical: classProperty.toLowerCase(),
        typed: classProperty,
      });
      if (!geometry && className.kind === "unknown") domains.push("unresolved-class");
      if (className.kind === "value") {
        const evidence = classEvidence(className.value);
        if (evidence.kind === "unknown") {
          if (!geometry) domains.push("unresolved-class");
        } else {
          domains.push(...evidence.tokens.flatMap(utilityDomains));
          for (const cssClass of geometry ? [] : (evidence.cssClasses ?? [])) {
            const fact = resolveCssModuleClass?.({
              ...cssClass,
              importerRepoPath: repoPath,
              tag: ancestor ? "ancestor" : classProperty === "className" ? owner.tag : "*",
            });
            if (!fact) domains.push("unresolved-class");
            else domains.push(...fact.domains);
          }
        }
      }
    }
    if (!geometry && style.kind === "unknown") domains.push("unresolved-style");
    if (style.kind === "value") {
      const effects = [...styleProperties(style.value, styleDomains).values()];
      domains.push(...effects.filter((domain) => !geometry || domain === "framework-token"));
    }
    const uniqueDomains = [...new Set(domains)];
    return uniqueDomains.length > 0
      ? {
          component: owner?.exportName ?? (ancestor ? "UI descendant" : "UI theme"),
          domains: uniqueDomains,
          node,
        }
      : undefined;
  };
}
