import {
  getToolcraftOwnedCssDeclarationDomains,
  getToolcraftAncestorStyleDomains,
} from "./toolcraft-public-component-style-policy.mjs";
import {
  toolcraftCssCompoundAllowsTag as compoundAllowsTag,
  toolcraftCssSelectorTargetsPublicTag,
  toolcraftCssSelectorUsesOwnedState,
  toolcraftCssSubjectLocalClasses as directLocalClasses,
  toolcraftCssSubjectNodes as subjectNodes,
  toolcraftCssSubjectUsesOwnedState as nodesUseOwnedState,
} from "./toolcraft-css-selector-subject.mjs";

import { toolcraftPublicUiHostTags } from "./toolcraft-public-ui-ownership.mjs";
const PUBLIC_TAGS = Object.freeze([...toolcraftPublicUiHostTags, "*", "ancestor"]);

export { toolcraftCssSelectorTargetsPublicTag,
  toolcraftCssSelectorUsesOwnedState };

function orderedDeclarationDomains(rule) {
  const domainsByProperty = new Map();
  for (const node of rule.nodes ?? []) {
    if (node.type !== "decl") continue;
    domainsByProperty.set(
      node.prop.toLowerCase(),
      getToolcraftOwnedCssDeclarationDomains(node.prop),
    );
  }
  return [...new Set([...domainsByProperty.values()].flat())];
}

function compositionFacts(rule) {
  const facts = [];
  for (const node of rule.nodes ?? []) {
    if (node.type !== "decl" || node.prop.toLowerCase() !== "composes") continue;
    const match = /^(.*?)\s+from\s+(["'])(.*?)\2\s*$/u.exec(node.value);
    const names = (match?.[1] ?? node.value).trim().split(/\s+/u).filter(Boolean);
    const specifier = match?.[3];
    for (const className of names) facts.push(Object.freeze({ className, specifier }));
  }
  return Object.freeze(facts);
}

export function collectToolcraftCssModuleClassFacts({ root, selectorParser }) {
  const domainsByClassAndTag = new Map();
  root.walkRules((rule) => {
    selectorParser((selectors) => {
      selectors.each((selector) => {
        const nodes = subjectNodes(selector);
        const classes = directLocalClasses(nodes);
        if (classes.length === 0) return;
        const domains = orderedDeclarationDomains(rule);
        const compositions = compositionFacts(rule);
        if (nodesUseOwnedState(nodes)) domains.push("interaction-state");
        for (const className of classes) {
          for (const tag of PUBLIC_TAGS) {
            if (tag !== "ancestor" && !compoundAllowsTag(nodes, tag)) continue;
            const key = `${className}\0${tag}`;
            const existing = domainsByClassAndTag.get(key) ?? {
              compositions: new Map(),
              domains: new Set(),
            };
            const effectiveDomains = tag === "ancestor"
              ? (rule.nodes ?? []).filter((node) => node.type === "decl")
                .flatMap((node) => getToolcraftAncestorStyleDomains(node.prop))
              : domains;
            for (const domain of effectiveDomains) existing.domains.add(domain);
            for (const composition of compositions) {
              existing.compositions.set(
                `${composition.className}\0${composition.specifier ?? ""}`,
                composition,
              );
            }
            domainsByClassAndTag.set(key, existing);
          }
        }
      });
    }).processSync(rule.selector);
  });
  return Object.freeze([...domainsByClassAndTag].map(([key, evidence]) => {
    const [className, tag] = key.split("\0");
    return Object.freeze({
      className,
      compositions: Object.freeze([...evidence.compositions.values()]),
      domains: Object.freeze([...evidence.domains]),
      tag,
    });
  }));
}
