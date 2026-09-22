export const toolcraftGpuComputeResourceKinds = Object.freeze([
  "storage-buffers",
  "storage-textures",
  "mixed",
] as const);

export const toolcraftGpuPassResourceKinds = Object.freeze([
  "uniforms-only",
  "sampled-textures",
  ...toolcraftGpuComputeResourceKinds,
] as const);

export const toolcraftGpuPassStages = Object.freeze([
  "render",
  "compute",
] as const);

export const toolcraftGpuPassStates = Object.freeze([
  "stateless",
  "feedback",
] as const);

export const toolcraftGpuPassSurfaceSets = Object.freeze([
  Object.freeze(["preview"] as const),
  Object.freeze(["export"] as const),
  Object.freeze(["preview", "export"] as const),
] as const);

type ToolcraftGpuPassStageExecution =
  | Readonly<{
      resources: (typeof toolcraftGpuPassResourceKinds)[number];
      stage: "render";
    }>
  | Readonly<{
      resources: (typeof toolcraftGpuComputeResourceKinds)[number];
      stage: "compute";
    }>;

export type ToolcraftGpuPassExecution = ToolcraftGpuPassStageExecution &
  Readonly<{
    /** `feedback` reads the prior generation; `stateless` does not. */
    state: (typeof toolcraftGpuPassStates)[number];
    surfaces: (typeof toolcraftGpuPassSurfaceSets)[number];
  }>;

type ToolcraftGpuException<Kind extends string> = Readonly<{
  evidence: string;
  kind: Kind;
}>;

export type ToolcraftGpuTechnique =
  | Readonly<{
      backend: "webgl";
      provider: "three";
    }>
  | Readonly<{
      backend: "webgl";
      exception: ToolcraftGpuException<
        "browser-compatibility" | "reference-parity"
      >;
      provider: "native" | "reference-runtime";
    }>
  | Readonly<{
      backend: "webgpu";
      capability: "shader-webgpu-vgpu";
      provider: "vgpu";
      versionPolicy: "app-pinned";
    }>
  | Readonly<{
      backend: "webgpu";
      owner: string;
      provider: "toolcraft-runtime";
    }>
  | Readonly<{
      backend: "webgpu";
      exception: ToolcraftGpuException<"reference-parity" | "vgpu-api-gap">;
      provider: "native" | "reference-runtime";
    }>;

export type ToolcraftGpuTechniqueSurfaces =
  | Readonly<{
      export?: never;
      preview: ToolcraftGpuTechnique;
    }>
  | Readonly<{
      export: ToolcraftGpuTechnique;
      preview?: never;
    }>
  | Readonly<{
      export: ToolcraftGpuTechnique;
      preview: ToolcraftGpuTechnique;
    }>;
