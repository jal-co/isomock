import fs from "node:fs/promises";

const manifestUrl = new URL("./toolcraft-contract-manifest.json", import.meta.url);

export const toolcraftContractManifest = Object.freeze(
  JSON.parse(await fs.readFile(manifestUrl, "utf8")),
);

function assertUniqueStringValues(values, path) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
    throw new TypeError(`${path} must be an array of strings.`);
  }
  if (new Set(values).size !== values.length) {
    throw new TypeError(`${path} must not contain duplicate values.`);
  }
}

if (toolcraftContractManifest.version !== 1) {
  throw new TypeError("Toolcraft contract manifest version must be 1.");
}

assertUniqueStringValues(
  toolcraftContractManifest.decisionRules?.map((rule) => rule.id),
  "decisionRules[].id",
);
assertUniqueStringValues(
  toolcraftContractManifest.builtInControls?.map((control) => control.type),
  "builtInControls[].type",
);
assertUniqueStringValues(
  toolcraftContractManifest.runtimeSurfaceComponentNames,
  "runtimeSurfaceComponentNames",
);
assertUniqueStringValues(
  toolcraftContractManifest.protectedControlExportNames,
  "protectedControlExportNames",
);
assertUniqueStringValues(
  toolcraftContractManifest.performanceVerification?.evidenceLevels,
  "performanceVerification.evidenceLevels",
);
assertUniqueStringValues(
  toolcraftContractManifest.performanceVerification?.requestClassification,
  "performanceVerification.requestClassification",
);

export const toolcraftDecisionRuleIds = Object.freeze(
  toolcraftContractManifest.decisionRules.map((rule) => rule.id),
);
export const toolcraftBuiltInControlTypes = Object.freeze(
  toolcraftContractManifest.builtInControls.map((control) => control.type),
);

const fragmentRenderers = {
  "built-in-control-table": () => [
    "[//]: # (toolcraft-contract:built-in-control-table:start)",
    "| `type` | Runtime visual owner |",
    "| --- | --- |",
    ...toolcraftContractManifest.builtInControls.map(
      (control) => `| \`${control.type}\` | \`${control.visualComponent}\` |`,
    ),
    "[//]: # (toolcraft-contract:built-in-control-table:end)",
  ].join("\n"),
  "decision-rule-list": () => [
    "[//]: # (toolcraft-contract:decision-rule-list:start)",
    ...toolcraftContractManifest.decisionRules.map((rule) => `- \`${rule.id}\``),
    "[//]: # (toolcraft-contract:decision-rule-list:end)",
  ].join("\n"),
  "decision-rule-table": () => [
    "[//]: # (toolcraft-contract:decision-rule-table:start)",
    "| Rule ID | Level | Area |",
    "| --- | --- | --- |",
    ...toolcraftContractManifest.decisionRules.map(
      (rule) => `| \`${rule.id}\` | ${rule.level} | ${rule.area} |`,
    ),
    "[//]: # (toolcraft-contract:decision-rule-table:end)",
  ].join("\n"),
};

export const toolcraftContractFragmentIds = Object.freeze(
  Object.keys(fragmentRenderers),
);

export function renderToolcraftContractFragment(fragmentId) {
  const render = fragmentRenderers[fragmentId];
  if (!render) {
    throw new TypeError(`Unknown Toolcraft contract fragment "${fragmentId}".`);
  }
  return render();
}

function normalizeFragment(source) {
  return source
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function getToolcraftContractFragmentFailures({
  fragmentIds,
  label,
  source,
}) {
  const failures = [];

  for (const fragmentId of fragmentIds) {
    const expected = renderToolcraftContractFragment(fragmentId);
    const startMarker = `[//]: # (toolcraft-contract:${fragmentId}:start)`;
    const endMarker = `[//]: # (toolcraft-contract:${fragmentId}:end)`;
    const startIndex = source.indexOf(startMarker);
    const endIndex = source.indexOf(endMarker);

    if (startIndex < 0 || endIndex < startIndex) {
      failures.push(`${label} is missing generated contract fragment "${fragmentId}"`);
      continue;
    }
    if (
      source.indexOf(startMarker, startIndex + startMarker.length) >= 0 ||
      source.indexOf(endMarker, endIndex + endMarker.length) >= 0
    ) {
      failures.push(`${label} contains duplicate contract fragment "${fragmentId}"`);
      continue;
    }

    const actual = source.slice(startIndex, endIndex + endMarker.length);
    if (normalizeFragment(actual) !== normalizeFragment(expected)) {
      failures.push(
        `${label} contract fragment "${fragmentId}" differs from toolcraft-contract-manifest.json`,
      );
    }
  }

  return failures;
}
