export type ToolcraftVerificationInputRole =
  | "runtime-production"
  | "proof-model"
  | "product-test"
  | "product-resource";

export type ToolcraftVerificationInputRoles = Readonly<{
  impactInventoryPath: string;
  productResourcePaths: readonly string[];
  productTestPaths: readonly string[];
  proofModelPaths: readonly string[];
  roleByPath: Readonly<Record<string, ToolcraftVerificationInputRole>>;
  rootFamily: "generated" | "starter";
  runtimeProductionPaths: readonly string[];
  semanticProofRootPaths: readonly string[];
}>;

export const toolcraftVerificationInputRootFamilies: Readonly<{
  generated: Readonly<{
    acceptanceDataPath: string;
    compositionPath: string;
    impactInventoryPath: string;
    name: "generated";
    performancePath: string;
    proofRootPaths: readonly string[];
    runtimeRootPaths: readonly string[];
    schemaPath: string;
    semanticProofRootPaths: readonly string[];
    stem: "app";
  }>;
  starter: Readonly<{
    acceptanceDataPath: string;
    compositionPath: string;
    impactInventoryPath: string;
    name: "starter";
    performancePath: string;
    proofRootPaths: readonly string[];
    runtimeRootPaths: readonly string[];
    schemaPath: string;
    semanticProofRootPaths: readonly string[];
    stem: "starter";
  }>;
}>;

export const toolcraftVerificationSourceRoots: readonly [
  "src",
  "e2e",
  "public",
];

export function classifyToolcraftVerificationInputRoles(
  graph: Readonly<{
    entries: readonly Readonly<{
      owner: "framework" | "platform" | "product";
      repoPath: string;
      role: "generated" | "production" | "test" | "test-support";
    }>[];
    forward: ReadonlyMap<string, readonly string[]>;
  }>,
): ToolcraftVerificationInputRoles;
