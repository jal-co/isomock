import { Logger, Verbosity, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

import type { ToolcraftModelFormat } from "../../schema/types";
import type {
  ToolcraftModelDecodeContext,
  ToolcraftModelDecodeResult,
  ToolcraftModelFormatAdapter,
} from "../model-import-types";
import { canonicalizeGltfDocument } from "./gltf-document-canonicalizer";
import { validateGltfDecodedCounts } from "./gltf-decoded-count-validation";
import {
  gltfDecodeFailure,
  throwIfGltfDecodeAborted,
  ToolcraftGltfDecodeError,
} from "./gltf-decode-safety";
import { prepareGltfSourceDocument } from "./gltf-source-document";
import { snapshotGltfDecodeSource } from "./gltf-source-snapshot";
import {
  TOOLCRAFT_GLTF_ADAPTER_VERSION,
  TOOLCRAFT_GLTF_GEOMETRY_DECODER_VERSION,
} from "./production-model-format-manifest";
import dracoDecoderWasm from "./vendor/draco/draco_decoder_gltf.wasm.json";
import createDracoDecoderModule from "./vendor/draco/draco_wasm_wrapper.cjs";

export {
  TOOLCRAFT_GLTF_ADAPTER_VERSION,
  TOOLCRAFT_GLTF_GEOMETRY_DECODER_VERSION,
};

const SUPPORTED_EXTENSION_NAMES: ReadonlySet<string> = new Set(
  ALL_EXTENSIONS.map((extension) => extension.EXTENSION_NAME),
);

let configuredIo: Promise<WebIO> | undefined;

function decodeBase64DataUrl(dataUrl: string): Uint8Array<ArrayBuffer> {
  const marker = ";base64,";
  const markerIndex = dataUrl.indexOf(marker);
  if (!dataUrl.startsWith("data:") || markerIndex < 0) {
    return gltfDecodeFailure(
      "format",
      "bundled-draco-decoder-unavailable",
      "The bundled Draco decoder payload is invalid.",
    );
  }
  const encoded = dataUrl.slice(markerIndex + marker.length);
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    return gltfDecodeFailure(
      "format",
      "bundled-draco-decoder-unavailable",
      "The bundled Draco decoder payload cannot be decoded.",
    );
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function createConfiguredIo(): Promise<WebIO> {
  const wasmBinary = decodeBase64DataUrl(dracoDecoderWasm.dataUrl);
  const [dracoDecoder] = await Promise.all([
    createDracoDecoderModule({ wasmBinary }),
    MeshoptDecoder.ready,
  ]);
  return new WebIO()
    .setLogger(new Logger(Verbosity.SILENT))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": dracoDecoder,
      "meshopt.decoder": MeshoptDecoder,
    });
}

function getConfiguredIo(): Promise<WebIO> {
  configuredIo ??= createConfiguredIo().catch((error: unknown) => {
    configuredIo = undefined;
    throw error;
  });
  return configuredIo;
}

async function decodePreparedGltf(
  context: ToolcraftModelDecodeContext,
  format: Extract<ToolcraftModelFormat, "glb" | "gltf">,
  prepared: ReturnType<typeof prepareGltfSourceDocument>,
): Promise<ToolcraftModelDecodeResult> {
  throwIfGltfDecodeAborted(context.signal);
  const io = await getConfiguredIo();
  throwIfGltfDecodeAborted(context.signal);
  let document;
  try {
    document = await io.readJSON(prepared.jsonDocument);
  } catch (error) {
    throwIfGltfDecodeAborted(context.signal);
    if (error instanceof ToolcraftGltfDecodeError) throw error;
    return gltfDecodeFailure(
      "format",
      "gltf-decode-failed",
      "The glTF geometry could not be decoded from its bounded in-memory resources.",
    );
  }
  throwIfGltfDecodeAborted(context.signal);
  validateGltfDecodedCounts(
    document,
    prepared.decodedCountExpectations,
    context.signal,
  );
  return canonicalizeGltfDocument(document, {
    adapterVersion: TOOLCRAFT_GLTF_ADAPTER_VERSION,
    features: prepared.features,
    limits: context.limits,
    missingAppearanceBindings: prepared.missingAppearanceBindings,
    retainedWorkerBytes: prepared.retainedWorkerBytes,
    signal: context.signal,
    sourceFormat: format,
  });
}

function createGltfAdapter(
  format: Extract<ToolcraftModelFormat, "glb" | "gltf">,
): ToolcraftModelFormatAdapter {
  const decode = (
    context: ToolcraftModelDecodeContext,
  ): Promise<ToolcraftModelDecodeResult> => {
    try {
      const snapshot = snapshotGltfDecodeSource(context, format);
      const prepared = prepareGltfSourceDocument(
        snapshot,
        format,
        SUPPORTED_EXTENSION_NAMES,
        context.limits,
        context.signal,
      );
      return decodePreparedGltf(context, format, prepared);
    } catch (error) {
      return Promise.reject(error);
    }
  };
  return Object.freeze({
    adapterVersion: TOOLCRAFT_GLTF_ADAPTER_VERSION,
    decode,
    format,
    rootExtensions: Object.freeze([`.${format}`]),
    workerCapable: true,
  });
}

export const toolcraftGlbModelFormatAdapter = createGltfAdapter("glb");
export const toolcraftGltfModelFormatAdapter = createGltfAdapter("gltf");

export const TOOLCRAFT_GLTF_MODEL_FORMAT_ADAPTERS = Object.freeze([
  toolcraftGlbModelFormatAdapter,
  toolcraftGltfModelFormatAdapter,
]);
