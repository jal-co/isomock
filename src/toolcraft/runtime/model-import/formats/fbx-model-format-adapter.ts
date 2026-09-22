import { type Material, type Object3D } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

import type {
  ToolcraftModelDecodeContext,
  ToolcraftModelDecodeResult,
  ToolcraftModelFormatAdapter,
} from "../model-import-types";
import { preflightFbx } from "./fbx-model-format-preflight";
import {
  createFbxPlaceholderRuntime,
  createFbxStaticAppearanceCatalog,
} from "./fbx-static-appearance";
import {
  threeStaticGeometryFailure,
  throwIfThreeStaticGeometryAborted,
  ToolcraftThreeStaticGeometryError,
} from "./three-static-geometry-primitives";
import { readThreeStaticGeometryBundle } from "./three-static-source-bundle";
import { canonicalizeThreeStaticGeometry } from "./three-static-geometry-canonicalizer";
import { TOOLCRAFT_FBX_ADAPTER_VERSION } from "./production-model-format-manifest";

export { TOOLCRAFT_FBX_ADAPTER_VERSION };

function disposeParsedFbx(root: Object3D): void {
  const geometries = new Set<{ dispose: () => void }>();
  const materials = new Set<Material>();
  root.traverse((node) => {
    const renderable = node as Object3D & {
      geometry?: { dispose?: () => void };
      material?: Material | readonly Material[];
    };
    if (typeof renderable.geometry?.dispose === "function") {
      geometries.add(renderable.geometry as { dispose: () => void });
    }
    const nodeMaterials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];
    for (const material of nodeMaterials) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

async function decodeFbx(
  context: ToolcraftModelDecodeContext,
): Promise<ToolcraftModelDecodeResult> {
  const bundle = readThreeStaticGeometryBundle(context, "fbx");
  const source = bundle.root.bytes.buffer;
  const embeddedImages = preflightFbx(source, context);
  throwIfThreeStaticGeometryAborted(context.signal);
  let object: Object3D | undefined;
  const placeholderRuntime = createFbxPlaceholderRuntime();
  try {
    try {
      object = new FBXLoader(placeholderRuntime.manager).parse(source, "");
    } finally {
      placeholderRuntime.restoreObjectUrl();
    }
    throwIfThreeStaticGeometryAborted(context.signal);
    return canonicalizeThreeStaticGeometry(object, {
      adapterVersion: TOOLCRAFT_FBX_ADAPTER_VERSION,
      appearance: createFbxStaticAppearanceCatalog(
        bundle,
        embeddedImages,
        context.limits,
      ),
      limits: context.limits,
      signal: context.signal,
      sourceByteLength: bundle.sourceByteLength,
      sourceFormat: "fbx",
    });
  } catch (error) {
    throwIfThreeStaticGeometryAborted(context.signal);
    if (error instanceof ToolcraftThreeStaticGeometryError) throw error;
    return threeStaticGeometryFailure(
      "format",
      "fbx-decode-failed",
      "The FBX geometry could not be decoded safely.",
    );
  } finally {
    if (object) disposeParsedFbx(object);
    placeholderRuntime.dispose();
  }
}

export const toolcraftFbxModelFormatAdapter: ToolcraftModelFormatAdapter =
  Object.freeze({
    adapterVersion: TOOLCRAFT_FBX_ADAPTER_VERSION,
    decode: decodeFbx,
    format: "fbx",
    rootExtensions: Object.freeze([".fbx"]),
    workerCapable: true,
  });
