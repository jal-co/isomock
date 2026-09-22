import type { ToolcraftModelFormatAdapter } from "../model-import-types";
import { toolcraftFbxModelFormatAdapter } from "./fbx-model-format-adapter";
import {
  TOOLCRAFT_GLTF_MODEL_FORMAT_ADAPTERS,
} from "./gltf-model-format-adapter";
import { toolcraftObjModelFormatAdapter } from "./obj-model-format-adapter";
import { toolcraftPlyModelFormatAdapter } from "./ply-model-format-adapter";
import { toolcraftStlModelFormatAdapter } from "./stl-model-format-adapter";
import { createToolcraftModelFormatAdapterRegistry } from "./model-format-adapter";
import {
  TOOLCRAFT_PRODUCTION_GEOMETRY_DECODER_VERSIONS,
  TOOLCRAFT_PRODUCTION_MODEL_FORMAT_MANIFEST,
} from "./production-model-format-manifest";

export type ToolcraftProductionWorkerModelFormatRegistration = Readonly<{
  adapter: ToolcraftModelFormatAdapter;
  geometryDecoderVersion: string;
}>;

const adaptersByFormat = new Map(
  [
    ...TOOLCRAFT_GLTF_MODEL_FORMAT_ADAPTERS,
    toolcraftFbxModelFormatAdapter,
    toolcraftObjModelFormatAdapter,
    toolcraftStlModelFormatAdapter,
    toolcraftPlyModelFormatAdapter,
  ].map((adapter) => [adapter.format, adapter]),
);

export const TOOLCRAFT_PRODUCTION_MODEL_FORMAT_REGISTRATIONS = Object.freeze(
  TOOLCRAFT_PRODUCTION_MODEL_FORMAT_MANIFEST.map((entry) => {
    const adapter = adaptersByFormat.get(entry.format);
    if (
      adapter === undefined ||
      adapter.adapterVersion !== entry.adapterVersion ||
      adapter.rootExtensions.length !== entry.extensions.length ||
      adapter.rootExtensions.some(
        (extension, index) => extension !== entry.extensions[index],
      )
    ) {
      throw new Error(
        `Worker model adapter "${entry.format}" does not match the production format manifest.`,
      );
    }
    return Object.freeze({
      adapter,
      geometryDecoderVersion: entry.decoderVersion,
    });
  }),
) satisfies readonly ToolcraftProductionWorkerModelFormatRegistration[];

if (
  adaptersByFormat.size !==
  TOOLCRAFT_PRODUCTION_MODEL_FORMAT_REGISTRATIONS.length
) {
  throw new Error(
    "Worker model adapter registry contains a format missing from the production manifest.",
  );
}

export const TOOLCRAFT_PRODUCTION_MODEL_FORMAT_ADAPTER_REGISTRY =
  createToolcraftModelFormatAdapterRegistry(
    TOOLCRAFT_PRODUCTION_MODEL_FORMAT_REGISTRATIONS.map(
      ({ adapter }) => adapter,
    ),
  );

export { TOOLCRAFT_PRODUCTION_GEOMETRY_DECODER_VERSIONS };
