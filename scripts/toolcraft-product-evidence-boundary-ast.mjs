import ts from "typescript";

import {
  isNestedToolcraftStringComposition,
  isToolcraftStringCompositionNode,
} from "./toolcraft-static-string.mjs";

const RESERVED_PIPELINE_BRIDGE_ATTRIBUTE =
  "data-toolcraft-pipeline-evidence";
const RESERVED_PIPELINE_BRIDGE_PATTERN =
  /(?:^|[^\p{L}\p{N}_-])data-toolcraft-pipeline-evidence(?:$|[^\p{L}\p{N}_-])/u;
const RESERVED_UNAVAILABLE_RESOURCE_FIXTURE_ATTRIBUTE =
  "data-toolcraft-unavailable-resource-evidence";
const RESERVED_UNAVAILABLE_RESOURCE_FIXTURE_PATTERN =
  /(?:^|[^\p{L}\p{N}_.-])(?:data-toolcraft-unavailable-resource-evidence|toolcraft\.browser-proof\.unavailable-resource-request)(?:$|[^\p{L}\p{N}_.-])/u;
const RESERVED_EVIDENCE_MESSAGE =
  "Product-owned source must use protected observable, export, fixture, interaction, budget, and pipeline helpers; it must not import, bridge, or forge reserved browser evidence channels.";

function referencesReservedPipelineBridge(staticValue) {
  return (
    typeof staticValue === "string" &&
    RESERVED_PIPELINE_BRIDGE_PATTERN.test(staticValue)
  );
}

function referencesReservedUnavailableResourceFixture(staticValue) {
  return (
    typeof staticValue === "string" &&
    RESERVED_UNAVAILABLE_RESOURCE_FIXTURE_PATTERN.test(staticValue)
  );
}

export function inspectToolcraftReservedEvidenceAccess({
  getNodeLocation,
  repoPath,
  resolveStaticString,
  sourceFile,
}) {
  const violations = [];
  const reportedLocations = new Set();

  function reportReservedEvidence(node) {
    const locationKey = `${node.getStart(sourceFile)}:${node.end}`;
    if (reportedLocations.has(locationKey)) return;

    reportedLocations.add(locationKey);
    violations.push({
      ...getNodeLocation(sourceFile, node),
      kind: "reserved-runtime-evidence",
      message: RESERVED_EVIDENCE_MESSAGE,
      repoPath,
    });
  }

  function visit(node) {
    if (
      isToolcraftStringCompositionNode(node) &&
      !isNestedToolcraftStringComposition(node)
    ) {
      const staticValue = resolveStaticString(node);
      const staticModuleValue =
        typeof staticValue === "string"
          ? staticValue.replace(/[?#].*$/u, "")
          : undefined;
      const isReservedModule =
        staticModuleValue !== undefined &&
        (/(?:^|\/)browser-(?:runtime|performance)-evidence(?:\.[cm]?[jt]s)?$/u.test(
          staticModuleValue,
        ) ||
          /(?:^|\/)browser-performance-measurement-(?:evidence|report)(?:\.[cm]?[jt]s)?$/u.test(
            staticModuleValue,
          ) ||
          /(?:^|\/)browser-performance-report(?:\.[cm]?[jt]s)?$/u.test(
            staticModuleValue,
          ) ||
          /(?:^|\/)performance-(?:checkpoint-report|environment-evidence|measurement-evidence)(?:\.[cm]?[jt]s)?$/u.test(
            staticModuleValue,
          ) ||
          /(?:^|\/)performance-path-helpers(?:\.[cm]?[jt]s)?$/u.test(
            staticModuleValue,
          ) ||
          /(?:^|\/)performance-pipeline-(?:evidence(?:-test-fixtures)?|invariants)(?:\.[cm]?[jt]s)?$/u.test(
            staticModuleValue,
          ) ||
          /(?:^|\/)test-evidence\/browser-(?:runtime|performance|performance-measurement)-contract(?:\.[cm]?[jt]s)?$/u.test(
            staticModuleValue,
          ) ||
          /(?:^|\/)toolcraft-(?:targeted-performance-report|kernel-benchmark-receipt)(?:\.[cm]?[jt]s)?$/u.test(
            staticModuleValue,
          ));
      const isReservedPayload =
        staticValue === "toolcraft.browser-runtime-evidence" ||
        staticValue === "toolcraft.browser-performance-evidence" ||
        staticValue === "toolcraft.browser-performance-measurement" ||
        staticValue === "toolcraft.performance-environment" ||
        staticValue ===
          "application/vnd.toolcraft.browser-runtime-evidence+json" ||
        staticValue ===
          "application/vnd.toolcraft.browser-performance-evidence+json" ||
        staticValue ===
          "application/vnd.toolcraft.browser-performance-measurement+json" ||
        staticValue ===
          "application/vnd.toolcraft.performance-environment+json" ||
        referencesReservedPipelineBridge(staticValue) ||
        referencesReservedUnavailableResourceFixture(staticValue) ||
        staticValue === "toolcraft.renderer-pipeline-evidence.snapshot";
      if (isReservedModule || isReservedPayload) {
        reportReservedEvidence(node);
      }
    }
    if (
      ts.isJsxAttribute(node) &&
      (
        node.name.getText(sourceFile) === RESERVED_PIPELINE_BRIDGE_ATTRIBUTE ||
        node.name.getText(sourceFile) ===
          RESERVED_UNAVAILABLE_RESOURCE_FIXTURE_ATTRIBUTE
      )
    ) {
      reportReservedEvidence(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

export function inspectToolcraftModuleLoading({
  getNodeLocation,
  repoPath,
  resolveStaticString,
  sourceFile,
}) {
  const violations = [];

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments.length > 0 &&
      resolveStaticString(node.arguments[0]) === undefined
    ) {
      violations.push({
        ...getNodeLocation(sourceFile, node.arguments[0]),
        kind: "non-static-module-specifier",
        message:
          "Product import() and require() calls must use a statically resolvable string so the Toolcraft source boundary can verify the loaded module.",
        repoPath,
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}
