import { isToolcraftDangerousDomCapabilityName } from
  "./toolcraft-dom-host-capabilities.mjs";
import {
  createToolcraftDomContainerErasureEvidence,
  createToolcraftDomIterationTypeEvidence,
} from
  "./toolcraft-dom-container-erasure-evidence.mjs";
import { createToolcraftDomStructuralTypeErasure } from
  "./toolcraft-dom-structural-type-erasure.mjs";
import { createToolcraftDomSourceDangerEvidence } from
  "./toolcraft-dom-source-danger-evidence.mjs";
import { toolcraftDomCallArgumentTargets } from
  "./toolcraft-dom-call-target-evidence.mjs";
import { createToolcraftDomLiteralShapeEvidence } from
  "./toolcraft-dom-literal-shape-evidence.mjs";
import { createToolcraftDomBoundedTypeReader } from
  "./toolcraft-dom-bounded-type-reader.mjs";
import { createToolcraftDomTypeEvidence } from
  "./toolcraft-dom-type-evidence.mjs";
import { createToolcraftStaticFlowValues } from
  "./toolcraft-static-flow-values.mjs";

const MAX_LITERAL_DEPTH = 12;

function violation() {
  return {
    code: "forbidden-ui-dom-capability-erasure",
    reason:
      "lib.dom capability cannot be erased into a structural non-DOM boundary that exposes markup or interaction authority.",
    tag: "dom-capability-erasure",
  };
}

export function createToolcraftDomCapabilityErasureEvidence({
  ambientDomAuthorityReported = false,
  checker,
  flowValues: providedFlowValues,
  ts,
}) {
  const reader = createToolcraftDomBoundedTypeReader({ checker, ts });
  const { directTypeEvidence, typeEvidence, typeHasLibDomName,
    typeHasLibDomOrigin } = createToolcraftDomTypeEvidence({
    checker, reader, ts,
  });
  const flowValues = providedFlowValues ?? createToolcraftStaticFlowValues({
    checker,
    resolveStaticString: () => undefined,
    ts,
  });
  function unwrap(node) {
    let current = node;
    while (
      ts.isAsExpression(current) || ts.isNonNullExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current)
    ) current = current.expression;
    return current;
  }

  const {
    pairedTypeErasure,
    preservesDom,
    sourceDangerEvidence,
    targetContainsDangerous,
    targetDangerEvidence,
    variants,
  } = createToolcraftDomStructuralTypeErasure({
    checker,
    reader,
    ts,
    typeEvidence,
    typeHasLibDomOrigin,
  });

  function directErasure(source, targetType, depth = 0) {
    const sourceType = checker.getTypeAtLocation(source);
    const opaqueDomSource = (sourceType.flags & (
      ts.TypeFlags.Any | ts.TypeFlags.Unknown
    )) !== 0 && (ts.isCallExpression(source) || ts.isNewExpression(source)) &&
      (source.arguments ?? []).some((argument) =>
        typeEvidence(checker.getTypeAtLocation(argument)) === "dom"
      );
    const sourceIsAttr = typeHasLibDomName(
      sourceType,
      new Set(["Attr"]),
    );
    const dangerousTarget = variants(targetType).some((member) => {
      const attrValue = sourceIsAttr && reader.propertyMatches(
        member, (property) => property.getName().toLowerCase() === "value",
        "target",
      );
      return !preservesDom(member) && (targetContainsDangerous(member) ||
        attrValue && (attrValue.kind === "exhausted" || attrValue.value));
    });
    return dangerousTarget && (
      pairedTypeErasure(sourceType, targetType, depth) ||
      sourceIsAttr || opaqueDomSource
    );
  }

  function clonedVisited(visited) {
    return new Map([...visited].map(([node, types]) => [node, new Set(types)]));
  }

  const { containsProvenDom, declarationInitializers } =
    createToolcraftDomSourceDangerEvidence({
      checker,
      maxDepth: MAX_LITERAL_DEPTH,
      ts,
      typeEvidence,
      unwrap,
    });

  function containsAmbientDomReference(expression) {
    let found = false;
    function visit(node) {
      if (found) return;
      if (ts.isIdentifier(node)) {
        const declarations = checker.getSymbolAtLocation(node)?.declarations ?? [];
        if (declarations.length > 0 && declarations.every((declaration) =>
          declaration.getSourceFile().isDeclarationFile
        ) && typeHasLibDomOrigin(checker.getTypeAtLocation(node))) {
          found = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(expression);
    return found;
  }

  const { erasedArray, erasedObject, propertyNames } =
    createToolcraftDomLiteralShapeEvidence({
      checker,
      directTypeEvidence,
      erase: (source, targetType, depth, visited) =>
        erasedLiteral(source, targetType, depth, visited),
      pairedTypeErasure,
      preservesDom,
      targetContainsDangerous,
      typeEvidence,
      typeHasLibDomOrigin,
      ts,
      unwrap,
      variants,
    });

  function erasedLiteral(source, targetType, depth = 0, visited = new Map()) {
    const directUnknownTarget = (targetType.flags & (
      ts.TypeFlags.Any | ts.TypeFlags.Unknown
    )) !== 0;
    const assertedUnknown = directUnknownTarget && (
      ts.isAsExpression(source) || ts.isTypeAssertionExpression(source) ||
      ts.isSatisfiesExpression(source)
    );
    const node = unwrap(source);
    if (ambientDomAuthorityReported && directUnknownTarget &&
      (assertedUnknown || ts.isCallExpression(node)) &&
      containsAmbientDomReference(node)) return false;
    const recursive = ts.isObjectLiteralExpression(node) ||
      ts.isArrayLiteralExpression(node) || ts.isConditionalExpression(node);
    if (!recursive && directErasure(node, targetType, depth)) return true;
    if (recursive && !targetContainsDangerous(targetType)) return false;
    if (variants(targetType).every((member) => preservesDom(member))) {
      return false;
    }
    if (depth >= MAX_LITERAL_DEPTH) {
      return targetContainsDangerous(targetType) &&
        (recursive || directErasure(node, targetType, depth));
    }
    const seen = visited.get(node) ?? new Set();
    if (seen.has(targetType)) return targetContainsDangerous(targetType);
    seen.add(targetType);
    visited.set(node, seen);
    if (ts.isObjectLiteralExpression(node)) {
      return erasedObject(node, targetType, depth, visited);
    }
    if (ts.isArrayLiteralExpression(node)) {
      return erasedArray(node, targetType, depth, visited);
    }
    if (ts.isConditionalExpression(node)) {
      return erasedLiteral(node.whenTrue, targetType, depth + 1,
        clonedVisited(visited)) ||
        erasedLiteral(node.whenFalse, targetType, depth + 1,
          clonedVisited(visited));
    }
    const initializers = declarationInitializers(node);
    if (initializers.length > 0) {
      return initializers.some((initializer) => erasedLiteral(
        initializer,
        targetType,
        depth + 1,
        clonedVisited(visited),
      ));
    }
    return directErasure(node, targetType, depth);
  }

  function containingFunction(node) {
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isFunctionLike(current)) return current;
    }
    return undefined;
  }

  function returnTarget(fn) {
    const signature = checker.getSignatureFromDeclaration(fn);
    const type = signature && checker.getReturnTypeOfSignature(signature);
    return type && { node: fn.type, type };
  }

  function assignmentTargetType(node) {
    if (ts.isIdentifier(node)) {
      for (const declaration of
        checker.getSymbolAtLocation(node)?.declarations ?? []) {
        if (ts.isVariableDeclaration(declaration) && declaration.type) {
          return checker.getTypeFromTypeNode(declaration.type);
        }
      }
    }
    return checker.getTypeAtLocation(node);
  }

  function bindingContainsDangerous(pattern) {
    return pattern.elements.some((element) => {
      const names = propertyNames(element.propertyName ?? element.name);
      return names.some(isToolcraftDangerousDomCapabilityName) ||
        (ts.isBindingPattern(element.name) &&
          bindingContainsDangerous(element.name));
    });
  }

  const erasedContainer = createToolcraftDomContainerErasureEvidence({
    checker,
    erase: (source, targetType, depth) =>
      erasedLiteral(source, targetType, depth),
    ts,
    unwrap,
  });

  function erasedTarget(source, target) {
    if (target.preservesIdentity) return false;
    if (ambientDomAuthorityReported && target.external &&
      containsAmbientDomReference(source)) return false;
    const sourceType = checker.getTypeAtLocation(unwrap(source));
    const sourceSymbol = sourceType.aliasSymbol ?? sourceType.symbol;
    const sourceIsModuleNamespace = Boolean(sourceSymbol?.flags & (
      ts.SymbolFlags.NamespaceModule | ts.SymbolFlags.ValueModule
    ));
    if (!target.node && typeEvidence(sourceType) === "dom" &&
      typeEvidence(target.type) === "dom" &&
      checker.isTypeAssignableTo(sourceType, target.type)) return false;
    const sourceIsAttr = typeHasLibDomName(sourceType, new Set(["Attr"]));
    const targetDanger = targetDangerEvidence(target.type);
    const attrValue = sourceIsAttr && reader.propertyMatches(
      target.type, (property) => property.getName().toLowerCase() === "value",
      "target",
    );
    const attrValueTarget = attrValue && (
      attrValue.kind === "exhausted" || attrValue.value
    );
    if (targetDanger === "safe" && !attrValueTarget) return false;
    if (!containsProvenDom(source) && (sourceIsModuleNamespace ||
      sourceDangerEvidence(sourceType) !== "dangerous")) return false;
    if (target.external && targetDanger !== "dangerous" &&
      (target.type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) === 0) {
      return false;
    }
    return erasedLiteral(source, target.type) ||
      erasedContainer(source, target.node);
  }

  const { forOfTarget, iterableElementType, referenceTypeArguments } =
    createToolcraftDomIterationTypeEvidence({ checker, reader, ts });

  return function inspectDomCapabilityErasure(node) {
    if ((ts.isVariableDeclaration(node) ||
      ts.isPropertyDeclaration(node) || ts.isParameter(node)) &&
      node.initializer && erasedTarget(
      node.initializer,
      { node: node.type ?? node.name, type: checker.getTypeAtLocation(node.name) },
    )) {
      return violation();
    }
    if (ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      erasedLiteral(node.right, assignmentTargetType(node.left))) {
      return violation();
    }
    if (ts.isReturnStatement(node) && node.expression) {
      const fn = containingFunction(node);
      const target = fn && returnTarget(fn);
      if (target && erasedTarget(node.expression, target)) {
        return violation();
      }
    }
    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
      const target = returnTarget(node);
      if (target && erasedTarget(node.body, target)) return violation();
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const pairEvidence = toolcraftDomCallArgumentTargets({
        call: node,
        checker,
        flowValues,
        pairIsDangerous: ({ source, target }) => erasedTarget(source, target),
        reader,
        ts,
      });
      if (pairEvidence.dangerousOverflow || pairEvidence.unknownOverflow ||
        pairEvidence.pairs.some(({ source, target }) =>
          erasedTarget(source, target)
        )) {
        return violation();
      }
    }
    if (ts.isYieldExpression(node) && node.expression) {
      const contextual = checker.getContextualType(node.expression);
      const fn = containingFunction(node);
      const returnType = fn && returnTarget(fn)?.type;
      const target = contextual ?? referenceTypeArguments(returnType)[0];
      if (target && erasedLiteral(node.expression, target)) return violation();
    }
    if (ts.isForOfStatement(node)) {
      const source = iterableElementType(node.expression);
      const target = forOfTarget(node);
      if (source && target && pairedTypeErasure(source, target)) {
        return violation();
      }
    }
    if (ts.isJsxAttribute(node) && node.initializer &&
      ts.isJsxExpression(node.initializer) && node.initializer.expression) {
      const source = node.initializer.expression;
      const type = checker.getContextualType(source);
      if (type && erasedTarget(source, { node: undefined, type })) {
        return violation();
      }
    }
    if (ts.isParameter(node) && ts.isBindingPattern(node.name) &&
      typeHasLibDomOrigin(checker.getTypeAtLocation(node)) &&
      bindingContainsDangerous(node.name)) return violation();
    return undefined;
  };
}
