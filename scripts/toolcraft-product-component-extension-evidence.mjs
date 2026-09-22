import { createToolcraftProductPublicComponentStyleEvidence } from
  "./toolcraft-product-public-component-style-evidence.mjs";
import { createToolcraftProductRawMarkupEvidence } from
  "./toolcraft-product-raw-markup-evidence.mjs";

export function createToolcraftProductComponentExtensionEvidence({
  checker,
  hostConstruction,
  repoPath,
  resolveCssModuleClass,
  resolveStaticString,
  ts,
}) {
  const inspectPublicComponentStyle =
    createToolcraftProductPublicComponentStyleEvidence({
      checker,
      flowValues: hostConstruction.flowValues,
      hostConstruction,
      repoPath,
      resolveCssModuleClass,
      resolveStaticString,
      ts,
    });
  const inspectRawMarkup = createToolcraftProductRawMarkupEvidence({
    checker,
    flowValues: hostConstruction.flowValues,
    resolveStaticString,
    ts,
  });

  return function inspectProductComponentExtension(node) {
    const rawMarkup = inspectRawMarkup(node);
    if (rawMarkup) {
      return [
        rawMarkup.node,
        "Product source must not inject raw control markup through dangerouslySetInnerHTML. Use public Toolcraft components.",
        "raw-control-markup",
      ];
    }
    const styledComponent = inspectPublicComponentStyle(node);
    return styledComponent ? [
      styledComponent.node.tagName,
      `Public ${styledComponent.component} owns its border, radius, background, color, shadow, opacity, text-decoration, and interaction-state chrome; product styling may extend layout, spacing, sizing, or typography only (found: ${styledComponent.domains.join(", ")}).`,
      "public-component-chrome",
    ] : undefined;
  };
}
