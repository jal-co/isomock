export type RendererProviderCompatibilityCommandId =
  | "enable"
  | "install"
  | "wgsl-check"
  | "delivery";

export type RendererProviderDependencyRole = "runtime" | "wgsl-tooling";

export type RendererProviderDependency<
  Role extends RendererProviderDependencyRole,
> = Readonly<{
  integrity: string;
  name: string;
  role: Role;
  version: string;
}>;

export type RendererProviderDefinition = Readonly<{
  adapterContractVersion: number;
  approvedRelease: RendererProviderApprovedRelease | null;
  resolutionPolicy?: "latest-stable";
  capability: string;
  dependencies: readonly [
    RendererProviderDependency<"runtime">,
    RendererProviderDependency<"wgsl-tooling">,
  ] | readonly [];
  requiredExports: readonly string[];
  viteLoader: string;
}>;

export type RendererProviderApprovedRelease = Readonly<{
  adapterContractVersion: 1;
  commands: readonly ["enable", "install", "wgsl-check", "delivery"];
  compatibilitySourceHash: string;
  dependencies: readonly [
    Readonly<{
      integrity: string;
      name: "vgpu";
      role: "runtime";
      version: string;
    }>,
    Readonly<{
      integrity: string;
      name: "@vgpu/wgsl";
      role: "wgsl-tooling";
      version: string;
    }>,
  ];
  testedAt: string;
}>;

export type RendererProviderCatalog = Readonly<{
  schemaVersion: 2 | 3;
  providers: Readonly<Record<string, RendererProviderDefinition>>;
}>;

export type PackageJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly PackageJsonValue[]
  | Readonly<{ [key: string]: PackageJsonValue }>;

export type RendererProviderPackageJson = Readonly<{
  dependencies?: Readonly<Record<string, PackageJsonValue>>;
  [key: string]: PackageJsonValue | undefined;
}>;

export type InspectRendererProviderInput = Readonly<{
  catalog: unknown;
  packageJson: RendererProviderPackageJson;
  providerId: string;
}>;

export type EnableRendererProviderInput = InspectRendererProviderInput;

export type RendererProviderInspectionStatus = "absent" | "exact" | "drifted";

export type RendererProviderDependencyMismatch = Readonly<{
  actualVersion: string;
  dependency: RendererProviderDependency<RendererProviderDependencyRole>;
  error: string;
}>;

type RendererProviderInspectionState<
  Status extends RendererProviderInspectionStatus,
> = Readonly<{
  errors: readonly string[];
  mismatchedDependencies: readonly RendererProviderDependencyMismatch[];
  missingDependencies: readonly RendererProviderDependency<RendererProviderDependencyRole>[];
  provider: RendererProviderDefinition;
  providerId: string;
  status: Status;
}>;

export type RendererProviderInspection =
  | RendererProviderInspectionState<"absent">
  | RendererProviderInspectionState<"exact">
  | RendererProviderInspectionState<"drifted">;

export type EnableRendererProviderResult = Readonly<{
  changed: boolean;
  packageJson: RendererProviderPackageJson;
}>;

export const rendererProviderCompatibilityCommandIds: readonly [
  "enable",
  "install",
  "wgsl-check",
  "delivery",
];

export function parseRendererProviderCatalog(value: unknown): RendererProviderCatalog;

export function parseRendererProviderApprovedRelease(
  value: unknown,
  path?: string,
): RendererProviderApprovedRelease;

export function inspectRendererProvider(
  input: InspectRendererProviderInput,
): RendererProviderInspection;

export function enableRendererProvider(
  input: EnableRendererProviderInput,
): EnableRendererProviderResult;
