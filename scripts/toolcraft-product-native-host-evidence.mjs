import ts from "typescript";

import {
  isToolcraftNativeActionAttributeName,
  isToolcraftNativeActionableRole,
} from "./toolcraft-native-semantic-policy.mjs";

const forbiddenInputTypes = new Map([
  ["checkbox", "checkbox or switch"],
  ["color", "color or colorOpacity"],
  ["file", "fileDrop"],
  ["radio", "segmented or select"],
  ["range", "slider or rangeSlider"],
]);

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isAsExpression(current) || ts.isNonNullExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) current = current.expression;
  return current;
}

function staticPropertyName(name, resolveStaticString) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return ts.isComputedPropertyName(name)
    ? resolveStaticString(name.expression)
    : undefined;
}

function attributeExpression(attribute) {
  if (!attribute.initializer) return true;
  return ts.isJsxExpression(attribute.initializer)
    ? attribute.initializer.expression
    : attribute.initializer;
}

function isStaticDisabledValue(value, resolveStaticString) {
  if (!value) return true;
  if (value === true) return false;
  const expression = unwrapExpression(value);
  if (
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    expression.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(expression) && expression.text === "undefined")
  ) return true;
  return resolveStaticString(expression)?.toLowerCase() === "false";
}

export function createToolcraftProductNativeHostEvidence({
  resolveStaticString,
}) {
  function hostHasActionableSemantics(attributes, { canvasGeometry = false } = {}) {
    const finalProperties = new Map();
    for (const attribute of attributes.properties) {
      if (ts.isJsxSpreadAttribute(attribute)) {
        const expression = unwrapExpression(attribute.expression);
        if (!ts.isObjectLiteralExpression(expression)) return true;
        for (const property of expression.properties) {
          if (ts.isSpreadAssignment(property) ||
            ts.isMethodDeclaration(property) ||
            ts.isGetAccessorDeclaration(property) ||
            ts.isSetAccessorDeclaration(property)) return true;
          const name = staticPropertyName(property.name, resolveStaticString);
          if (!name) return true;
          const value = ts.isPropertyAssignment(property)
            ? property.initializer
            : ts.isShorthandPropertyAssignment(property)
              ? property.name : undefined;
          if (!value) return true;
          finalProperties.set(name.toLowerCase(), value);
        }
        continue;
      }
      if (!ts.isJsxAttribute(attribute)) continue;
      const name = staticPropertyName(attribute.name, resolveStaticString);
      if (name) {
        finalProperties.set(name.toLowerCase(), attributeExpression(attribute));
      }
    }
    const spatialPointerEvents = new Set([
      "onpointerdown", "onpointermove", "onpointerup", "onpointercancel", "onlostpointercapture",
    ]);
    const canvasInteraction = canvasGeometry && finalProperties.has("data-toolcraft-canvas-handle");
    for (const [name, value] of finalProperties) {
      if (canvasInteraction && spatialPointerEvents.has(name)) continue;
      if (isToolcraftNativeActionAttributeName(name) && name !== "role" &&
        !isStaticDisabledValue(value, resolveStaticString)) return true;
    }
    const roleValue = finalProperties.get("role");
    const role = roleValue && roleValue !== true
      ? resolveStaticString(unwrapExpression(roleValue))
      : undefined;
    if (roleValue && role === undefined &&
      !isStaticDisabledValue(roleValue, resolveStaticString)) return true;
    if (role && isToolcraftNativeActionableRole(role)) return true;
    return finalProperties.has("draggable") && !isStaticDisabledValue(
      finalProperties.get("draggable"),
      resolveStaticString,
    );
  }

  function getInputType(attributes) {
    let inputType = "text";
    for (const property of attributes.properties) {
      if (ts.isJsxSpreadAttribute(property)) {
        inputType = null;
        continue;
      }
      if (!ts.isIdentifier(property.name) || property.name.text !== "type") {
        continue;
      }
      if (!property.initializer) {
        inputType = null;
      } else if (ts.isStringLiteral(property.initializer)) {
        inputType = property.initializer.text;
      } else if (ts.isJsxExpression(property.initializer) &&
        property.initializer.expression) {
        inputType = resolveStaticString(property.initializer.expression) ?? null;
      } else {
        inputType = null;
      }
    }
    return inputType?.toLowerCase() ?? null;
  }

  return Object.freeze({
    forbiddenSchemaType: (inputType) => forbiddenInputTypes.get(inputType),
    getInputType,
    hostHasActionableSemantics,
  });
}
