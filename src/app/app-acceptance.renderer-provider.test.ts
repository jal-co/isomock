import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import type { ToolcraftRendererTechnique } from "@/toolcraft/runtime";

import { parseRendererProviderCatalog } from "../toolcraft/renderer-providers/provider-config.mjs";
import { parseRendererProviderResolution, rendererProviderActivationChecks } from "../toolcraft/renderer-providers/provider-resolution.mjs";
import type { RendererProviderPackageJson } from "../toolcraft/renderer-providers/provider-config.mjs";
import { getToolcraftRendererProviderConfigurationErrors } from "./acceptance/renderer-provider";

const appDir = dirname(fileURLToPath(import.meta.url));
const projectDir = join(appDir, "../..");

const catalogSource = JSON.parse(
  readFileSync(
    join(projectDir, "src/toolcraft/renderer-providers/catalog.json"),
    "utf8",
  ),
) as unknown;
const catalog = parseRendererProviderCatalog(catalogSource);
const provider = catalog.providers.vgpu;
if (!provider) {
  throw new Error('The renderer provider catalog must define "vgpu".');
}

// This synthetic tuple exercises configuration validation, never release selection or GPU proof.
const resolution = parseRendererProviderResolution({
  schemaVersion: 1, resolvedAt: "2026-09-09T00:00:00.000Z",
  compatibilitySourceHash: "a".repeat(64), checks: rendererProviderActivationChecks,
  dependencies: [
    { name: "vgpu", role: "runtime", version: "9.8.7", integrity: "sha512-synthetic-runtime" },
    { name: "@vgpu/wgsl", role: "wgsl-tooling", version: "9.8.7", integrity: "sha512-synthetic-tooling" },
  ],
});
const toolcraft = { rendererProviders: { vgpu: resolution } };

const exactDependencies = Object.freeze(
  Object.fromEntries(
    resolution.dependencies.map(({ name, version }) => [name, version]),
  ),
);
const runtimeDependency = resolution.dependencies.find(
  ({ role }) => role === "runtime",
);
const toolingDependency = resolution.dependencies.find(
  ({ role }) => role === "wgsl-tooling",
);
if (!runtimeDependency || !toolingDependency) {
  throw new Error("The VGPU provider must define its closed dependency tuple.");
}

function withoutDependency(name: string): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(exactDependencies).filter(
        ([dependencyName]) => dependencyName !== name,
      ),
    ),
  );
}

function mismatchedVersion(version: string): string {
  return version === "0.0.0" ? "0.0.1" : "0.0.0";
}

const selectedVgpuInvalidDependencyCases = resolution.dependencies.flatMap(
  (dependency) => [
    {
      dependencies: withoutDependency(dependency.name),
      name: `missing ${dependency.role} dependency`,
    },
    {
      dependencies: {
        ...exactDependencies,
        [dependency.name]: `^${dependency.version}`,
      },
      name: `ranged ${dependency.role} dependency`,
    },
    {
      dependencies: {
        ...exactDependencies,
        [dependency.name]: mismatchedVersion(dependency.version),
      },
      name: `mismatched ${dependency.role} dependency`,
    },
  ],
);

const unusedVgpuInvalidDependencyCases = resolution.dependencies.flatMap(
  (dependency) => [
    {
      dependencies: { [dependency.name]: dependency.version },
      name: `partial tuple containing only ${dependency.role}`,
    },
    {
      dependencies: {
        ...exactDependencies,
        [dependency.name]: `~${dependency.version}`,
      },
      name: `tuple with ranged ${dependency.role}`,
    },
    {
      dependencies: {
        ...exactDependencies,
        [dependency.name]: mismatchedVersion(dependency.version),
      },
      name: `tuple with mismatched ${dependency.role}`,
    },
  ],
);

const vgpuSurface = {
  backend: "webgpu",
  capability: "shader-webgpu-vgpu",
  provider: "vgpu",
  versionPolicy: "app-pinned",
} as const;
const nativeSurface = {
  backend: "webgpu",
  exception: {
    evidence: "The required native API is outside the provider adapter.",
    kind: "vgpu-api-gap",
  },
  provider: "native",
} as const;
const referenceSurface = {
  backend: "webgpu",
  exception: {
    evidence: "The inspected reference runtime is the behavior authority.",
    kind: "reference-parity",
  },
  provider: "reference-runtime",
} as const;
const runtimeSurface = {
  backend: "webgpu",
  owner: "Toolcraft model renderer",
  provider: "toolcraft-runtime",
} as const;
const threeSurface = { backend: "webgl", provider: "three" } as const;
const vgpuSurfaceCases = [
  { gpu: { preview: vgpuSurface }, name: "preview-only" },
  { gpu: { export: vgpuSurface }, name: "export-only" },
] satisfies readonly Readonly<{
  gpu: NonNullable<ToolcraftRendererTechnique["gpu"]>;
  name: string;
}>[];
const invalidProviderDependencyValueCases = [
  {
    createValue: () => ({ version: resolution.dependencies[0].version }),
    name: "object",
  },
  { createValue: () => [resolution.dependencies[0].version], name: "array" },
  { createValue: () => 301, name: "number" },
  { createValue: () => null, name: "null" },
] as const;

function validate({
  dependencies = {},
  gpu,
}: Readonly<{
  dependencies?: Readonly<Record<string, string>>;
  gpu?: ToolcraftRendererTechnique["gpu"];
}>) {
  return getToolcraftRendererProviderConfigurationErrors({
    catalog: catalogSource,
    gpu,
    packageJson: { dependencies, toolcraft },
  });
}

describe("Toolcraft renderer provider configuration", () => {
  describe.each(vgpuSurfaceCases)("$name VGPU selection", ({ gpu }) => {
    it("accepts the exact ordered provider tuple", () => {
      expect(
        validate({
          dependencies: exactDependencies,
          gpu,
        }),
      ).toEqual([]);
    });

    it.each(selectedVgpuInvalidDependencyCases)(
      "rejects $name",
      ({ dependencies }) => {
        expect(
          validate({
            dependencies,
            gpu,
          }),
        ).toEqual([
          "rendererTechnique selects VGPU, but the provider is not enabled. Run `npm run toolcraft:renderer -- enable vgpu`; activation installs and verifies dependencies automatically.",
        ]);
      },
    );

    it.each(invalidProviderDependencyValueCases)(
      "reports the repair for a $name dependency value",
      ({ createValue }) => {
        const packageJson = {
          toolcraft,
          dependencies: {
            ...exactDependencies,
            [runtimeDependency.name]: createValue(),
          },
        } satisfies RendererProviderPackageJson;
        expect(
          getToolcraftRendererProviderConfigurationErrors({
            catalog: catalogSource,
            gpu,
            packageJson,
          }),
        ).toEqual([
          "rendererTechnique selects VGPU, but the provider is not enabled. Run `npm run toolcraft:renderer -- enable vgpu`; activation installs and verifies dependencies automatically.",
        ]);
      },
    );
  });

  it("rejects the unused exact VGPU provider tuple", () => {
    expect(validate({ dependencies: exactDependencies })).toEqual([
      "VGPU provider dependencies are enabled, but rendererTechnique does not select VGPU.",
    ]);
  });

  it.each(unusedVgpuInvalidDependencyCases)(
    "rejects $name when VGPU is not selected",
    ({ dependencies }) => {
      expect(validate({ dependencies })).toEqual([
        "VGPU provider dependencies are incomplete or drifted, but rendererTechnique does not select VGPU.",
      ]);
    },
  );

  it.each(
    [
      { gpu: { preview: nativeSurface }, name: "native WebGPU" },
      { gpu: { preview: referenceSurface }, name: "reference WebGPU" },
      { gpu: { preview: runtimeSurface }, name: "runtime-owned WebGPU" },
      { gpu: { preview: threeSurface }, name: "Three WebGL" },
    ] satisfies readonly Readonly<{
      gpu: NonNullable<ToolcraftRendererTechnique["gpu"]>;
      name: string;
    }>[],
  )("accepts $name without enabling VGPU", ({ gpu }) => {
    expect(
      validate({
        gpu,
      }),
    ).toEqual([]);
  });
});
