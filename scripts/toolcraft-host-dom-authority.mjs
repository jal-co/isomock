import {
  toolcraftHostBindingInitializer as bindingInitializer,
  toolcraftHostBindingPath as bindingPath,
  toolcraftHostBindingRoot as bindingRoot,
  toolcraftHostStaticMemberName as staticMemberName,
  unwrapToolcraftHostExpression as unwrap,
} from "./toolcraft-host-origin-values.mjs";
import {
  isToolcraftDocumentHostFactoryName,
  isToolcraftDomHostFactoryName,
  isToolcraftNodeHostFactoryName,
  toolcraftDocumentHostFactoryNames,
  toolcraftDomHostFactoryNames,
} from "./toolcraft-dom-host-capabilities.mjs";
import { createToolcraftDomTypeEvidence } from
  "./toolcraft-dom-type-evidence.mjs";

export const toolcraftDocumentHostAuthorities =
  toolcraftDocumentHostFactoryNames;
export const toolcraftDomHostAuthorities = toolcraftDomHostFactoryNames;

export const toolcraftDomInteractiveTags = Object.freeze(new Set([
  "a",
  "button",
  "details",
  "input",
  "select",
  "summary",
  "textarea",
]));

export function createToolcraftHostDomAuthority({
  checker,
  failClosedUnresolvedDomAuthority,
  resolveStaticString,
  ts,
}) {
  const { typeHasLibDomName, typeHasLibDomOrigin } =
    createToolcraftDomTypeEvidence({ checker, ts });
  const documentNames = new Set(["Document", "XMLDocument"]);
  const typeIsDocument = (type) =>
    typeHasLibDomName(type, documentNames);

  function isDocumentOwner(expression) {
    const owner = unwrap(expression, ts);
    if ((ts.isPropertyAccessExpression(owner) ||
      ts.isElementAccessExpression(owner)) &&
      staticMemberName(owner, resolveStaticString, ts) === "ownerDocument") {
      return true;
    }
    if (typeIsDocument(checker.getTypeAtLocation(owner))) return true;
    if (ts.isIdentifier(owner) && owner.text === "document") {
      return (checker.getSymbolAtLocation(owner)?.declarations ?? [])
        .every((declaration) => declaration.getSourceFile().isDeclarationFile);
    }
    return false;
  }

  function isDomOwner(expression) {
    return typeHasLibDomOrigin(checker.getTypeAtLocation(unwrap(expression, ts)));
  }

  function isUnresolvedOwner(expression) {
    if (!failClosedUnresolvedDomAuthority) return false;
    const type = checker.getTypeAtLocation(unwrap(expression, ts));
    return (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
  }

  function typeIsUnresolved(type) {
    return Boolean(failClosedUnresolvedDomAuthority && type &&
      (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0);
  }

  function bindingOwnerMatches(declaration, factory) {
    const initializer = bindingInitializer(declaration, ts);
    const members = bindingPath(declaration, resolveStaticString, ts);
    if (!members) return true;
    const ownerMembers = declaration.dotDotDotToken
      ? members : members.slice(0, -1);
    const documentPath = ownerMembers.includes("ownerDocument");
    if (initializer &&
      (declaration.dotDotDotToken || isToolcraftNodeHostFactoryName(factory))) {
      return isDomOwner(initializer) || isUnresolvedOwner(initializer) ||
        documentPath;
    }
    if (initializer) {
      return isDocumentOwner(initializer) || isUnresolvedOwner(initializer) ||
        documentPath;
    }
    const root = bindingRoot(declaration, ts);
    const rootType = root && checker.getTypeAtLocation(root);
    const bindingType = checker.getTypeAtLocation(declaration.name);
    if (declaration.dotDotDotToken || isToolcraftNodeHostFactoryName(factory)) {
      return typeHasLibDomOrigin(rootType) ||
        typeHasLibDomOrigin(bindingType) || typeIsUnresolved(rootType) ||
        typeIsUnresolved(bindingType) || documentPath;
    }
    return typeIsDocument(rootType) || typeHasLibDomOrigin(bindingType) ||
      typeIsUnresolved(rootType) || typeIsUnresolved(bindingType) ||
      documentPath;
  }

  return Object.freeze({
    bindingOwnerMatches,
    isDocumentOwner,
    isDomOwner,
    isUnresolvedOwner,
    isToolcraftDocumentHostFactoryName,
    isToolcraftDomHostFactoryName,
  });
}
