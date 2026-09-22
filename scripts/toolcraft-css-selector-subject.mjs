import {
  isToolcraftOwnedComponentState,
  isToolcraftOwnedComponentStateAttribute,
} from "./toolcraft-public-component-style-policy.mjs";
import { toolcraftCssPseudoName as pseudoName } from
  "./toolcraft-css-pseudo-name.mjs";
import { toolcraftPublicUiHostTags } from "./toolcraft-public-ui-ownership.mjs";

export function toolcraftCssSubjectNodes(selector) {
  let subject = [];
  for (const node of selector.nodes ?? []) {
    if (node.type === "combinator") subject = [];
    else subject.push(node);
  }
  return subject;
}

function branchAllowsTag(branch, tag) {
  return toolcraftCssCompoundAllowsTag(toolcraftCssSubjectNodes(branch), tag);
}

function branchNecessarilyMatchesTag(branch, tag) {
  return toolcraftCssCompoundNecessarilyMatchesTag(
    toolcraftCssSubjectNodes(branch), tag,
  );
}

function toolcraftCssCompoundNecessarilyMatchesTag(nodes, tag) {
  let matchingTag = false;
  for (const node of nodes) {
    if (node.type === "tag") {
      if (node.value.toLowerCase() !== tag) return false;
      matchingTag = true;
      continue;
    }
    if (node.type === "universal") continue;
    if ([":is", ":where"].includes(pseudoName(node)) &&
      node.nodes?.some((branch) => branch.type === "selector" &&
        branchNecessarilyMatchesTag(branch, tag))) {
      matchingTag = true;
      continue;
    }
    return false;
  }
  return matchingTag;
}

export function toolcraftCssCompoundAllowsTag(nodes, tag) {
  if (tag === "*") return true;
  for (const node of nodes) {
    if (node.type === "tag" && node.value.toLowerCase() !== tag) return false;
    if (node.type !== "pseudo" || !node.nodes?.length) continue;
    if ([":is", ":where"].includes(pseudoName(node)) &&
      !node.nodes.some((branch) =>
        branch.type === "selector" && branchAllowsTag(branch, tag)
      )) return false;
    if (pseudoName(node) === ":not" && node.nodes.some((branch) =>
      branch.type === "selector" && branchNecessarilyMatchesTag(branch, tag)
    )) return false;
  }
  return true;
}

export function toolcraftCssSubjectLocalClasses(nodes) {
  const names = [];
  for (const node of nodes) {
    if (node.type === "class") names.push(node.value);
    if ([":is", ":where"].includes(pseudoName(node))) {
      for (const branch of node.nodes ?? []) {
        if (branch.type === "selector") names.push(
          ...toolcraftCssSubjectLocalClasses(toolcraftCssSubjectNodes(branch)),
        );
      }
    }
    if (pseudoName(node) === ":local") {
      node.walkClasses((candidate) => names.push(candidate.value));
    }
  }
  return [...new Set(names)];
}

export function toolcraftCssSubjectUsesOwnedState(nodes) {
  return nodes.some((node) => {
    if (node.type === "pseudo" && !node.nodes?.length) {
      return isToolcraftOwnedComponentState(node.value);
    }
    if ([":is", ":where", ":not"].includes(pseudoName(node))) {
      return (node.nodes ?? []).some((branch) => branch.type === "selector" &&
        toolcraftCssSubjectUsesOwnedState(toolcraftCssSubjectNodes(branch)));
    }
    return node.type === "attribute" &&
      isToolcraftOwnedComponentStateAttribute(node.attribute, node.value);
  });
}

function positivelyMentionsTag(nodes, tag, negated = false) {
  return nodes.some((node) => {
    if (node.type === "tag") {
      return !negated && node.value.toLowerCase() === tag;
    }
    if (!node.nodes?.length ||
      ![":is", ":where", ":not"].includes(pseudoName(node))) return false;
    const nextNegated = pseudoName(node) === ":not" ? !negated : negated;
    return (node.nodes ?? []).some((branch) => branch.type === "selector" &&
      positivelyMentionsTag(
        toolcraftCssSubjectNodes(branch), tag, nextNegated,
      ));
  });
}

export function toolcraftCssSelectorTargetsPublicTag(selector, tag) {
  const nodes = toolcraftCssSubjectNodes(selector);
  return toolcraftCssCompoundAllowsTag(nodes, tag) &&
    positivelyMentionsTag(nodes, tag);
}

export function toolcraftCssSelectorUsesOwnedState(selector) {
  return toolcraftCssSubjectUsesOwnedState(toolcraftCssSubjectNodes(selector));
}

export function toolcraftCssSelectorTargetsPublicChrome(selector) {
  const nodes = toolcraftCssSubjectNodes(selector);
  const htmlTags = toolcraftPublicUiHostTags.filter((tag) => !["svg", "img"].includes(tag));
  if (htmlTags.some((tag) => toolcraftCssSelectorTargetsPublicTag(selector, tag))) return true;
  function mentionsPublicAttribute(items) {
    return items.some((node) => {
      if (node.type === "attribute") return node.attribute === "data-slot" ||
        (node.attribute === "role" && ["button", "checkbox", "radio", "slider", "switch",
          "textbox", "combobox", "listbox", "option", "tab", "tablist", "menuitem"].includes(node.value));
      return [":is", ":where"].includes(pseudoName(node)) &&
        node.nodes?.some((branch) => mentionsPublicAttribute(toolcraftCssSubjectNodes(branch)));
    });
  }
  if (mentionsPublicAttribute(nodes)) return true;
  // A locally named geometric child is handled where its class is applied.
  // An unqualified descendant/universal selector can reach any public host.
  return toolcraftCssSubjectLocalClasses(nodes).length === 0 &&
    htmlTags.some((tag) => toolcraftCssCompoundAllowsTag(nodes, tag));
}
