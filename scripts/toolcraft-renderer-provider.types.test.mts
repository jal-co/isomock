import {
  enableRendererProvider,
  inspectRendererProvider,
  parseRendererProviderCatalog,
  rendererProviderCompatibilityCommandIds,
} from "../src/toolcraft/renderer-providers/provider-config.mjs";
import type {
  EnableRendererProviderInput,
  EnableRendererProviderResult,
  InspectRendererProviderInput,
  RendererProviderInspection,
  RendererProviderCompatibilityCommandId,
} from "../src/toolcraft/renderer-providers/provider-config.mjs";

const input: EnableRendererProviderInput = {
  catalog: {
    schemaVersion: 2,
    providers: {},
  },
  packageJson: {
    dependencies: {},
    name: "type-contract-fixture",
  },
  providerId: "vgpu",
};
const catalog = parseRendererProviderCatalog(input.catalog);
const result = enableRendererProvider(input);
const inspectionInput: InspectRendererProviderInput = input;
const inspection = inspectRendererProvider(inspectionInput);
const inspectionStatus: "absent" | "exact" | "drifted" = inspection.status;
const commandIds: readonly ["enable", "install", "wgsl-check", "delivery"] =
  rendererProviderCompatibilityCommandIds;
const commandId: RendererProviderCompatibilityCommandId = commandIds[0];
const runtimeRole: "runtime" = catalog.providers.vgpu.approvedRelease!.dependencies[0].role;
if (!catalog.providers.vgpu.approvedRelease) {
  throw new Error("The legacy catalog type fixture requires an approved release.");
}
const approvedRuntimeName: "vgpu" =
  catalog.providers.vgpu.approvedRelease!.dependencies[0].name;
const approvedToolingName: "@vgpu/wgsl" =
  catalog.providers.vgpu.approvedRelease!.dependencies[1].name;

// @ts-expect-error Parsed catalogs are immutable.
catalog.schemaVersion = 1;
// @ts-expect-error Parsed provider definitions are immutable.
catalog.providers.vgpu.capability = "replacement";
// @ts-expect-error Provider dependency tuples are immutable.
catalog.providers.vgpu.dependencies.push(catalog.providers.vgpu.dependencies[0]);
// @ts-expect-error Dependency roles are fixed by tuple position.
catalog.providers.vgpu.dependencies[0].role = "wgsl-tooling";
// @ts-expect-error Enable results are immutable.
result.changed = false;
// @ts-expect-error Inspection results are immutable.
inspection.status = "exact";
// @ts-expect-error Inspection errors are immutable.
inspection.errors.push("replacement");
// @ts-expect-error Enabled package dependencies are immutable.
result.packageJson.dependencies!.vgpu = "9.9.9";
// @ts-expect-error The semantic command tuple cannot be extended.
rendererProviderCompatibilityCommandIds.push("upgrade");
// @ts-expect-error Compatibility command ids are a closed union.
const invalidCommandId: RendererProviderCompatibilityCommandId = "upgrade";

enableRendererProvider({
  ...input,
  // @ts-expect-error Enable inputs reject unsupported top-level keys.
  unexpected: true,
});

// @ts-expect-error Enable inputs require a provider id.
const missingProviderId: EnableRendererProviderInput = {
  catalog: input.catalog,
  packageJson: input.packageJson,
};

const invalidResult: EnableRendererProviderResult = {
  changed: false,
  packageJson: {},
  // @ts-expect-error Enable outputs reject unsupported top-level keys.
  unexpected: true,
};

const invalidInspection: RendererProviderInspection = {
  ...inspection,
  // @ts-expect-error Inspection status is a closed union.
  status: "enabled",
};

void [
  catalog,
  result,
  inspection,
  inspectionStatus,
  commandId,
  runtimeRole,
  approvedRuntimeName,
  approvedToolingName,
  invalidCommandId,
  missingProviderId,
  invalidResult,
  invalidInspection,
];
