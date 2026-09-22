export function createToolcraftDomLiteralShapeEvidence({
  checker,
  directTypeEvidence,
  erase,
  pairedTypeErasure,
  preservesDom,
  targetContainsDangerous,
  typeEvidence,
  typeHasLibDomOrigin,
  ts,
  unwrap,
  variants,
}) {
  function typeAtProperty(type, name, location) {
    return variants(type).flatMap((member) => {
      const property = checker.getPropertyOfType(member, name);
      const propertyTypes = property
        ? [checker.getTypeOfSymbolAtLocation(property, location)]
        : [];
      const numeric = /^\d+$/u.test(name);
      const indexType = checker.getIndexTypeOfType(
        member,
        numeric ? ts.IndexKind.Number : ts.IndexKind.String,
      );
      return [...propertyTypes, ...(indexType ? [indexType] : [])];
    });
  }

  function propertyNames(node) {
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node)) return [node.text];
    if (ts.isComputedPropertyName(node)) {
      const type = checker.getTypeAtLocation(node.expression);
      return variants(type).flatMap((member) => {
        if ((member.flags & ts.TypeFlags.StringLiteral) !== 0) {
          return [member.value];
        }
        if ((member.flags & ts.TypeFlags.NumberLiteral) !== 0) {
          return [String(member.value)];
        }
        return [];
      });
    }
    return [];
  }

  function clonedVisited(visited) {
    return new Map([...visited].map(([node, types]) => [
      node,
      new Set(types),
    ]));
  }

  function erasedAgainst(source, targetTypes, depth, visited) {
    return targetTypes.some((target) => erase(
      source,
      target,
      depth,
      clonedVisited(visited),
    ));
  }

  function erasedObject(object, targetType, depth, visited) {
    return object.properties.some((property) => {
      if (ts.isSpreadAssignment(property)) {
        if (typeHasLibDomOrigin(
          checker.getTypeAtLocation(unwrap(property.expression)),
        ) && variants(targetType).some((member) => !preservesDom(member))) {
          return true;
        }
        return erase(
          property.expression,
          targetType,
          depth + 1,
          clonedVisited(visited),
        );
      }
      const names = propertyNames(property.name);
      if (names.length === 0) {
        const value = ts.isPropertyAssignment(property)
          ? property.initializer : property.name;
        return typeEvidence(checker.getTypeAtLocation(value)) !== "plain" &&
          targetContainsDangerous(targetType);
      }
      const targets = names.flatMap((name) =>
        typeAtProperty(targetType, name, property)
      );
      if (ts.isGetAccessorDeclaration(property) ||
        ts.isSetAccessorDeclaration(property) ||
        ts.isMethodDeclaration(property)) {
        return directTypeEvidence(checker.getTypeAtLocation(property)) !==
          "plain" &&
          targets.some((target) => targetContainsDangerous(target));
      }
      if (!ts.isPropertyAssignment(property) &&
        !ts.isShorthandPropertyAssignment(property)) {
        return targets.some((target) => targetContainsDangerous(target));
      }
      const source = ts.isPropertyAssignment(property)
        ? property.initializer : property.name;
      return targets.length > 0 && erasedAgainst(
        source,
        targets,
        depth + 1,
        visited,
      );
    });
  }

  function erasedArray(array, targetType, depth, visited) {
    return array.elements.some((element, index) => {
      if (ts.isSpreadElement(element)) {
        const spread = unwrap(element.expression);
        if (!ts.isArrayLiteralExpression(spread)) {
          const sourceElements = typeAtProperty(
            checker.getTypeAtLocation(spread),
            "0",
            spread,
          );
          const targetElements = typeAtProperty(
            targetType,
            String(index),
            element,
          );
          if (sourceElements.length > 0 && targetElements.length > 0) {
            return sourceElements.some((sourceElement) =>
              targetElements.some((targetElement) =>
                pairedTypeErasure(sourceElement, targetElement, depth + 1)
              )
            );
          }
        }
        return erase(
          element.expression,
          targetType,
          depth + 1,
          clonedVisited(visited),
        );
      }
      const targets = typeAtProperty(targetType, String(index), element);
      return targets.length > 0 && erasedAgainst(
        element,
        targets,
        depth + 1,
        visited,
      );
    });
  }

  return Object.freeze({ erasedArray, erasedObject, propertyNames });
}
