import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

import type {
  ToolcraftModelDecodeContext,
  ToolcraftModelDecodeResult,
  ToolcraftModelFormatAdapter,
} from "../model-import-types";
import {
  threeStaticGeometryFailure,
  throwIfThreeStaticGeometryAborted,
  ToolcraftThreeStaticGeometryError,
} from "./three-static-geometry-primitives";
import { loadObjMaterialLibrary } from "./obj-material-library";
import { readThreeStaticGeometryBundle } from "./three-static-source-bundle";
import { canonicalizeThreeStaticGeometry } from "./three-static-geometry-canonicalizer";
import { TOOLCRAFT_OBJ_ADAPTER_VERSION } from "./production-model-format-manifest";

export { TOOLCRAFT_OBJ_ADAPTER_VERSION } from "./production-model-format-manifest";

function sourceUsesPolygonFaces(source: string): boolean {
  return source.split(/\r\n|\r|\n/u).some((line) => {
    const tokens = line.trim().split(/\s+/u);
    return tokens[0] === "f" && tokens.length > 4;
  });
}

async function decodeObj(
  context: ToolcraftModelDecodeContext,
): Promise<ToolcraftModelDecodeResult> {
  const bundle = readThreeStaticGeometryBundle(context, "obj");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bundle.root.bytes);
  } catch {
    return threeStaticGeometryFailure(
      "format",
      "invalid-obj-encoding",
      "OBJ text must use valid UTF-8 encoding.",
    );
  }
  throwIfThreeStaticGeometryAborted(context.signal);
  try {
    const materialLibrary = loadObjMaterialLibrary(
      text,
      bundle,
      context.limits,
      context.signal,
    );
    const object = new OBJLoader().parse(text);
    throwIfThreeStaticGeometryAborted(context.signal);
    return canonicalizeThreeStaticGeometry(object, {
      adapterVersion: TOOLCRAFT_OBJ_ADAPTER_VERSION,
      appearance: {
        diagnostics: materialLibrary.diagnostics,
        resolveMaterial: (material) => material
          ? materialLibrary.materialsByName.get(material.name)
          : undefined,
      },
      limits: context.limits,
      operations: sourceUsesPolygonFaces(text)
        ? ["deterministic-triangulation"]
        : [],
      signal: context.signal,
      sourceByteLength: bundle.sourceByteLength,
      sourceFormat: "obj",
    });
  } catch (error) {
    throwIfThreeStaticGeometryAborted(context.signal);
    if (error instanceof ToolcraftThreeStaticGeometryError) throw error;
    return threeStaticGeometryFailure(
      "format",
      "obj-decode-failed",
      "The OBJ geometry could not be decoded safely.",
    );
  }
}

export const toolcraftObjModelFormatAdapter: ToolcraftModelFormatAdapter =
  Object.freeze({
    adapterVersion: TOOLCRAFT_OBJ_ADAPTER_VERSION,
    decode: decodeObj,
    format: "obj",
    rootExtensions: Object.freeze([".obj"]),
    workerCapable: true,
  });
