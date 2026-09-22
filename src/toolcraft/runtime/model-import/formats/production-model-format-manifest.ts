import type { ToolcraftModelFormat } from "../../schema/types";
import type {
  ToolcraftModelFormatAdapterIdentity,
  ToolcraftModelFormatIdentityRegistry,
} from "./model-format-adapter";

export const TOOLCRAFT_GLTF_ADAPTER_VERSION = "gltf-webio-pbr@2";
export const TOOLCRAFT_GLTF_GEOMETRY_DECODER_VERSION =
  "gltf-transform@4.4.1+draco+meshoptimizer@1.2.0+pbr2";
export const TOOLCRAFT_FBX_ADAPTER_VERSION = "fbx-three-static-appearance@2";
export const TOOLCRAFT_OBJ_ADAPTER_VERSION = "obj-three-mtl@2";
export const TOOLCRAFT_STL_ADAPTER_VERSION = "stl-three-color@2";
export const TOOLCRAFT_PLY_ADAPTER_VERSION = "ply-three-color@2";
export const TOOLCRAFT_THREE_STATIC_GEOMETRY_DECODER_VERSION =
  "three@0.185.1";

export type ToolcraftProductionModelFormatManifestEntry = Readonly<{
  accept: string;
  adapterVersion: string;
  decoderVersion: string;
  extensions: readonly string[];
  format: ToolcraftModelFormat;
}>;

export type ToolcraftProductionModelFormatRegistration = Readonly<{
  adapter: ToolcraftModelFormatAdapterIdentity;
  geometryDecoderVersion: string;
}>;

function manifestEntry(
  format: Extract<
    ToolcraftModelFormat,
    "fbx" | "glb" | "gltf" | "obj" | "ply" | "stl"
  >,
  adapterVersion: string,
  decoderVersion: string,
): ToolcraftProductionModelFormatManifestEntry {
  const extensions = Object.freeze([`.${format}`]);
  return Object.freeze({
    accept: extensions.join(","),
    adapterVersion,
    decoderVersion,
    extensions,
    format,
  });
}

export const TOOLCRAFT_PRODUCTION_MODEL_FORMAT_MANIFEST = Object.freeze([
  manifestEntry(
    "glb",
    TOOLCRAFT_GLTF_ADAPTER_VERSION,
    TOOLCRAFT_GLTF_GEOMETRY_DECODER_VERSION,
  ),
  manifestEntry(
    "gltf",
    TOOLCRAFT_GLTF_ADAPTER_VERSION,
    TOOLCRAFT_GLTF_GEOMETRY_DECODER_VERSION,
  ),
  manifestEntry(
    "fbx",
    TOOLCRAFT_FBX_ADAPTER_VERSION,
    TOOLCRAFT_THREE_STATIC_GEOMETRY_DECODER_VERSION,
  ),
  manifestEntry(
    "obj",
    TOOLCRAFT_OBJ_ADAPTER_VERSION,
    TOOLCRAFT_THREE_STATIC_GEOMETRY_DECODER_VERSION,
  ),
  manifestEntry(
    "stl",
    TOOLCRAFT_STL_ADAPTER_VERSION,
    TOOLCRAFT_THREE_STATIC_GEOMETRY_DECODER_VERSION,
  ),
  manifestEntry(
    "ply",
    TOOLCRAFT_PLY_ADAPTER_VERSION,
    TOOLCRAFT_THREE_STATIC_GEOMETRY_DECODER_VERSION,
  ),
]);

export const TOOLCRAFT_PRODUCTION_MODEL_FORMAT_REGISTRATIONS = Object.freeze(
  TOOLCRAFT_PRODUCTION_MODEL_FORMAT_MANIFEST.map((entry) =>
    Object.freeze({
      adapter: Object.freeze({
        adapterVersion: entry.adapterVersion,
        format: entry.format,
        rootExtensions: entry.extensions,
      }),
      geometryDecoderVersion: entry.decoderVersion,
    }),
  ),
) satisfies readonly ToolcraftProductionModelFormatRegistration[];

export const TOOLCRAFT_PRODUCTION_MODEL_FORMAT_ADAPTER_REGISTRY =
  Object.freeze({
    adapters: Object.freeze(
      TOOLCRAFT_PRODUCTION_MODEL_FORMAT_REGISTRATIONS.map(
        ({ adapter }) => adapter,
      ),
    ),
  }) satisfies ToolcraftModelFormatIdentityRegistry;

const geometryDecoderVersions: Partial<Record<ToolcraftModelFormat, string>> =
  {};
for (const entry of TOOLCRAFT_PRODUCTION_MODEL_FORMAT_MANIFEST) {
  geometryDecoderVersions[entry.format] = entry.decoderVersion;
}

export const TOOLCRAFT_PRODUCTION_GEOMETRY_DECODER_VERSIONS = Object.freeze(
  geometryDecoderVersions,
);

export const TOOLCRAFT_ADVERTISED_MODEL_FORMATS = Object.freeze(
  TOOLCRAFT_PRODUCTION_MODEL_FORMAT_MANIFEST.map(({ format }) => format),
);

export const TOOLCRAFT_MODEL_ROOT_EXTENSIONS = Object.freeze(
  TOOLCRAFT_PRODUCTION_MODEL_FORMAT_MANIFEST.flatMap(({ extensions }) =>
    extensions,
  ).sort(),
);

export const TOOLCRAFT_MODEL_FILE_DROP_ACCEPT =
  `${TOOLCRAFT_PRODUCTION_MODEL_FORMAT_MANIFEST
    .map(({ accept }) => accept)
    .join(",")},.zip`;

export function getToolcraftProductionModelFormatManifestEntry(
  format: unknown,
): ToolcraftProductionModelFormatManifestEntry | undefined {
  if (typeof format !== "string") return undefined;
  return TOOLCRAFT_PRODUCTION_MODEL_FORMAT_MANIFEST.find(
    (entry) => entry.format === format,
  );
}
