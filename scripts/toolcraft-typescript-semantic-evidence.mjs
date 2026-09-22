import {
  collectToolcraftTypeScriptCallTargets,
  collectToolcraftTypeScriptModuleBindings,
} from "./toolcraft-typescript-analysis.mjs";
import {
  getToolcraftTypeScriptModuleShape,
} from "./toolcraft-typescript-module-shape.mjs";

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function collectToolcraftTypeScriptSemanticFacts({
  checker,
  resolveStaticString,
  sourceFile,
  ts,
}) {
  const identifiers = new Set();
  const staticStrings = new Set();
  function visit(node) {
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    if (ts.isComputedPropertyName(node)) {
      const value = resolveStaticString(node.expression);
      if (value !== undefined) staticStrings.add(value);
    } else if (
      ts.isStringLiteralLike(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node) ||
      ts.isCallExpression(node) ||
      ts.isIdentifier(node) ||
      (ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.PlusToken)
    ) {
      const value = resolveStaticString(node);
      if (value !== undefined) staticStrings.add(value);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  const bindings = collectToolcraftTypeScriptModuleBindings(
    sourceFile,
    ts,
    checker,
  );
  const callTargets = collectToolcraftTypeScriptCallTargets({
    bindings,
    checker,
    sourceFile,
    ts,
  });
  return Object.freeze({
    exportedCallableBindings: bindings.exportedCallableBindings,
    exportedRuntimeBindings: bindings.exportedRuntimeBindings,
    identifiers: Object.freeze([...identifiers].sort(compareCodeUnits)),
    importedCallTargets: callTargets.importedCallTargets,
    importedRuntimeBindings: bindings.importedRuntimeBindings,
    localCallTargets: callTargets.localCallTargets,
    moduleShape: getToolcraftTypeScriptModuleShape(
      sourceFile,
      ts,
      { bindings, checker },
    ),
    staticStrings: Object.freeze([...staticStrings].sort(compareCodeUnits)),
  });
}
